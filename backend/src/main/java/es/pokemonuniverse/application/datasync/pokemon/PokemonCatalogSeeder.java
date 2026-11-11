package es.pokemonuniverse.application.datasync.pokemon;

import es.pokemonuniverse.application.ports.SyncHttp;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code syncPokemonData} de {@code prisma/seed.ts}: sincroniza PokéAPI en PostgreSQL por fases (base, formas
 * regionales, learnsets, evolución, metadatos de Pokeddle y entradas de Pokédex). Una fase solo escribe cuando ya
 * tiene descargados todos sus requisitos, y su versión en {@code "PokemonCatalogSync"} se escribe al terminarla.
 *
 * <p>Las peticiones van por {@link SyncHttp} (Node usa su propio {@code fetchJson}: 4 intentos con espera
 * {@code intento*400} ms); un estado HTTP de error conserva el literal de Node
 * {@code PokéAPI returned <status> for <label>}. Los lotes de 25 peticiones concurrentes conservan el orden.
 */
public class PokemonCatalogSeeder {

  private static final Logger LOG = LoggerFactory.getLogger(PokemonCatalogSeeder.class);
  static final int BATCH_SIZE = 25;
  private static final int WRITE_BATCH = 100;
  public static final String LEARNSET_SYNC_KEY = "canonical-level-up-learnsets";
  public static final int LEARNSET_SYNC_VERSION = 1;
  public static final String EVOLUTION_SYNC_KEY = "evolution-positions";
  public static final int EVOLUTION_SYNC_VERSION = 2;
  public static final String POKEDDLE_METADATA_SYNC_KEY = "pokeddle-species-metadata";
  public static final int POKEDDLE_METADATA_SYNC_VERSION = 3;
  public static final String POKEDEX_ENTRY_SYNC_KEY = "spanish-pokedex-entries";
  public static final int POKEDEX_ENTRY_SYNC_VERSION = 1;
  private static final List<String> SYNC_KEYS =
      List.of(LEARNSET_SYNC_KEY, EVOLUTION_SYNC_KEY, POKEDDLE_METADATA_SYNC_KEY, POKEDEX_ENTRY_SYNC_KEY);
  private static final Pattern SPECIES_URL = Pattern.compile("/pokemon-species/(\\d+)/?$");
  private static final Pattern TRAILING_ID = Pattern.compile("/(\\d+)/?$");
  private static final Pattern REGION = Pattern.compile("-(alola|galar|hisui|paldea)(?:-(.+))?$");
  private static final Pattern TOTEM = Pattern.compile("-totem(?:-|$)");
  private static final Pattern REGIONAL = Pattern.compile("-(alola|galar|hisui|paldea)$");
  private static final Pattern TAUROS = Pattern.compile("^tauros-paldea-(combat|blaze|aqua)-breed$");
  private static final Map<String, String> REGION_LABELS =
      Map.of("alola", "Alola", "galar", "Galar", "hisui", "Hisui", "paldea", "Paldea");

  private final PokemonCatalogStore store;
  private final SyncHttp http;
  private final PokeApiUrls urls;
  private final Clock clock;

  public PokemonCatalogSeeder(PokemonCatalogStore store, SyncHttp http, PokeApiUrls urls, Clock clock) {
    this.store = store;
    this.http = http;
    this.urls = urls;
    this.clock = clock;
  }

  /** Ejecuta las fases pendientes (todas con {@code force}). */
  public void sync(boolean force, SeederLimits limits) {
    var counts = store.counts(SYNC_KEYS);
    var versions = counts.versions();
    int species = limits.speciesCount();
    boolean needsBase = force || counts.enrichedDefault() < species;
    boolean needsRegional = force || counts.regional() < limits.minRegionalForms();
    boolean needsLearnsets = force || versions.getOrDefault(LEARNSET_SYNC_KEY, 0) < LEARNSET_SYNC_VERSION
        || counts.moves() < limits.minMoves() || counts.learnsets() < limits.minLearnsetEntries();
    boolean needsEvolution = force || versions.getOrDefault(EVOLUTION_SYNC_KEY, 0) < EVOLUTION_SYNC_VERSION
        || counts.evolution() < species;
    boolean needsMetadata = force
        || versions.getOrDefault(POKEDDLE_METADATA_SYNC_KEY, 0) < POKEDDLE_METADATA_SYNC_VERSION
        || counts.metadata() < species;
    boolean needsPokedexEntries = force
        || versions.getOrDefault(POKEDEX_ENTRY_SYNC_KEY, 0) < POKEDEX_ENTRY_SYNC_VERSION
        || counts.spanishEntries() < limits.minPokedexEntries();
    if (!needsBase && !needsRegional && !needsLearnsets && !needsEvolution && !needsMetadata && !needsPokedexEntries) {
      LOG.info("Catalog ready: {} Pokémon, {} forms, {} moves and {} learnset entries.", counts.enrichedDefault(),
          counts.regional(), counts.moves(), counts.learnsets());
      return;
    }

    List<JsonNode> defaultPokemon = needsBase || needsLearnsets || needsEvolution || needsMetadata || needsPokedexEntries
        ? fetchRange(limits, number -> fetchPokemon(String.valueOf(number)), "Pokémon data") : List.of();
    List<JsonNode> speciesList = needsBase || needsRegional || needsEvolution || needsMetadata || needsPokedexEntries
        ? fetchRange(limits, this::fetchSpecies, "species metadata") : List.of();
    Map<String, JsonNode> speciesByName = new HashMap<>();
    for (var entry : speciesList) speciesByName.put(PokeApiPayloads.text(entry.get("name")), entry);
    var regional = new ArrayList<JsonNode>();
    if (needsRegional || needsMetadata) {
      var regionalNames = fetchRegionalFormNames();
      if (regionalNames.size() < limits.minRegionalForms()) {
        throw new IllegalStateException("Expected at least " + limits.minRegionalForms() + " regional forms, received "
            + regionalNames.size());
      }
      regional.addAll(inBatches(regionalNames, this::fetchPokemon));
    }
    if (needsBase || needsRegional || needsMetadata) {
      var all = new ArrayList<>(defaultPokemon);
      all.addAll(regional);
      var spanishAbilityNames = fetchSpanishAbilityNames(all);
      if (needsBase || needsMetadata) {
        upsertPokemon(defaultPokemon.stream()
            .map(pokemon -> toEntry(pokemon, true, speciesFor(speciesByName, pokemon), spanishAbilityNames, limits))
            .toList());
      }
      if (needsRegional || needsMetadata) {
        upsertPokemon(regional.stream()
            .map(pokemon -> toEntry(pokemon, false, speciesFor(speciesByName, pokemon), spanishAbilityNames, limits))
            .toList());
        LOG.info("Seeded {} regional forms.", regional.size());
      }
    }
    if (needsLearnsets) {
      syncLearnsets(defaultPokemon, limits);
      store.markSynced(LEARNSET_SYNC_KEY, LEARNSET_SYNC_VERSION, now());
    }
    if (needsEvolution) {
      syncEvolution(defaultPokemon, speciesList);
      store.markSynced(EVOLUTION_SYNC_KEY, EVOLUTION_SYNC_VERSION, now());
    }
    if (needsMetadata) store.markSynced(POKEDDLE_METADATA_SYNC_KEY, POKEDDLE_METADATA_SYNC_VERSION, now());
    if (needsPokedexEntries) {
      syncPokedexEntries(defaultPokemon, speciesList, limits);
      store.markSynced(POKEDEX_ENTRY_SYNC_KEY, POKEDEX_ENTRY_SYNC_VERSION, now());
    }
  }

  // --- Descargas -------------------------------------------------------------------------------------------------

  private JsonNode fetchJson(URI uri, String label) {
    try {
      return http.json(uri, label);
    } catch (SyncHttp.SyncHttpException e) {
      if (e.status() == 0) throw e;
      throw new SyncHttp.SyncHttpException("PokéAPI returned " + e.status() + " for " + label, e.status());
    }
  }

  private JsonNode fetchPokemon(String identifier) {
    return fetchJson(urls.endpoint("pokemon/" + identifier), "Pokémon " + identifier);
  }

  private JsonNode fetchSpecies(int number) {
    return fetchJson(urls.endpoint("pokemon-species/" + number), "species " + number);
  }

  private List<String> fetchRegionalFormNames() {
    var body = fetchJson(urls.endpoint("pokemon?limit=100000"), "Pokémon forms");
    var names = new ArrayList<String>();
    for (var entry : PokeApiPayloads.items(body.get("results"))) {
      var name = PokeApiPayloads.text(entry.get("name"));
      if (isSupportedRegionalFormId(name)) names.add(name);
    }
    names.sort(null);
    return names;
  }

  private List<JsonNode> fetchRange(SeederLimits limits, Function<Integer, JsonNode> fetch, String label) {
    var result = new ArrayList<JsonNode>();
    for (int start = limits.firstNationalDex(); start <= limits.lastNationalDex(); start += BATCH_SIZE) {
      var numbers = new ArrayList<Integer>();
      for (int n = start; n <= Math.min(start + BATCH_SIZE - 1, limits.lastNationalDex()); n++) numbers.add(n);
      result.addAll(concurrently(numbers, fetch));
      LOG.info("Loaded {} {}-{}", label, start, numbers.getLast());
    }
    return result;
  }

  private Map<String, String> fetchSpanishAbilityNames(List<JsonNode> pokemon) {
    Map<String, String> sources = new HashMap<>();
    for (var entry : pokemon) {
      for (var ability : PokeApiPayloads.items(entry.get("abilities"))) {
        var reference = ability.get("ability");
        sources.put(PokeApiPayloads.text(reference.get("name")), PokeApiPayloads.text(reference.get("url")));
      }
    }
    var names = new ArrayList<>(sources.keySet());
    names.sort(null);
    Map<String, String> result = new HashMap<>();
    for (int start = 0; start < names.size(); start += BATCH_SIZE) {
      var batch = names.subList(start, Math.min(start + BATCH_SIZE, names.size()));
      var abilities = concurrently(batch, name -> fetchJson(urls.resolve(sources.get(name)), "ability " + name));
      for (var ability : abilities) {
        var name = PokeApiPayloads.text(ability.get("name"));
        var spanish = AbilityNameExtractor.spanishName(PokeApiPayloads.names(ability.get("names")));
        if (spanish == null) throw new IllegalStateException("PokéAPI has no official Spanish name for ability " + name);
        result.put(name, spanish);
      }
      LOG.info("Loaded Spanish ability names {}-{} / {}", start + 1, Math.min(start + BATCH_SIZE, names.size()),
          names.size());
    }
    return result;
  }

  private <T> List<JsonNode> inBatches(List<T> items, Function<T, JsonNode> fetch) {
    var result = new ArrayList<JsonNode>();
    for (int start = 0; start < items.size(); start += BATCH_SIZE) {
      result.addAll(concurrently(items.subList(start, Math.min(start + BATCH_SIZE, items.size())), fetch));
    }
    return result;
  }

  /** {@code Promise.all}: en paralelo, resultados en el orden de entrada; falla con el primer error por posición. */
  static <T, R> List<R> concurrently(List<T> items, Function<T, R> task) {
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = new ArrayList<Future<R>>();
      for (var item : items) futures.add(executor.submit(() -> task.apply(item)));
      var results = new ArrayList<R>();
      for (var future : futures) {
        try {
          results.add(future.get());
        } catch (ExecutionException e) {
          // Como Promise.all, las demás peticiones no se interrumpen (un hilo interrumpido haría que SyncHttpClient
          // reintentase como si fuera un timeout); el cierre del ejecutor espera a que terminen.
          if (e.getCause() instanceof RuntimeException runtime) throw runtime;
          if (e.getCause() instanceof Error error) throw error;
          throw new IllegalStateException(e.getCause());
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException(e);
        }
      }
      return results;
    }
  }

  // --- Transformación --------------------------------------------------------------------------------------------

  /** {@code isSupportedRegionalFormId} de {@code shared/pokemon/types.ts}. */
  static boolean isSupportedRegionalFormId(String id) {
    if (TOTEM.matcher(id).find()) return false;
    return REGIONAL.matcher(id).find() || TAUROS.matcher(id).find() || id.equals("darmanitan-galar-standard")
        || id.equals("basculin-white-striped");
  }

  /** {@code displayName}: cada palabra separada por guiones con la primera unidad UTF-16 en mayúscula. */
  static String displayName(String value) {
    var words = new ArrayList<String>();
    for (var word : value.split("-", -1)) {
      if (word.isEmpty()) throw new IllegalStateException("Cannot read properties of undefined (reading 'toUpperCase')");
      words.add(String.valueOf(word.charAt(0)).toUpperCase(Locale.ROOT) + word.substring(1));
    }
    return String.join(" ", words);
  }

  private static int nationalDexNumberFor(JsonNode pokemon, SeederLimits limits) {
    var url = PokeApiPayloads.text(pokemon.get("species").get("url"));
    var match = SPECIES_URL.matcher(url);
    long number = -1;
    if (match.find()) {
      try {
        number = Long.parseLong(match.group(1));
      } catch (NumberFormatException ignored) {
        number = -1;
      }
    }
    if (number < 1 || number > limits.lastNationalDex()) {
      throw new IllegalStateException("Invalid species URL for " + PokeApiPayloads.text(pokemon.get("name")) + ": " + url);
    }
    return (int) number;
  }

  private static String regionalDisplayName(JsonNode pokemon) {
    var name = PokeApiPayloads.text(pokemon.get("name"));
    var species = PokeApiPayloads.nestedName(pokemon, "species");
    if (name.equals("basculin-white-striped")) return displayName(species) + " (Raya Blanca)";
    var region = REGION.matcher(name);
    if (!region.find()) return displayName(species);
    var detail = region.group(2) != null ? " (" + displayName(region.group(2)) + ")" : "";
    return displayName(species) + " de " + REGION_LABELS.get(region.group(1)) + detail;
  }

  private static JsonNode speciesFor(Map<String, JsonNode> speciesByName, JsonNode pokemon) {
    var species = speciesByName.get(PokeApiPayloads.nestedName(pokemon, "species"));
    if (species == null) throw new IllegalStateException("Cannot read properties of undefined (reading 'names')");
    return species;
  }

  /** {@code Object.fromEntries} de los nombres en esos idiomas (el último de cada idioma gana). */
  private static Map<String, String> localized(@Nullable JsonNode names, @Nullable List<String> languages) {
    Map<String, String> result = new LinkedHashMap<>();
    for (var entry : PokeApiPayloads.names(names)) {
      if (languages == null || languages.contains(entry.language())) result.put(entry.language(), entry.name());
    }
    return result;
  }

  private static JsonNode nodeOrNull(@Nullable JsonNode node) {
    return node == null ? JsonNode.nullNode() : node;
  }

  private static JsonNode path(JsonNode node, String... fields) {
    JsonNode current = node;
    for (var field : fields) {
      if (current == null || !current.isObject()) return JsonNode.nullNode();
      current = current.get(field);
    }
    return current == null ? JsonNode.nullNode() : current;
  }

  private PokemonCatalogStore.PokemonRow toEntry(JsonNode pokemon, boolean isDefault, JsonNode species,
      Map<String, String> spanishAbilityNames, SeederLimits limits) {
    int nationalDexNumber = nationalDexNumberFor(pokemon, limits);
    Map<String, Integer> stats = new HashMap<>();
    for (var entry : PokeApiPayloads.items(pokemon.get("stats"))) {
      stats.put(PokeApiPayloads.nestedName(entry, "stat"), PokeApiPayloads.integer(entry.get("base_stat")));
    }
    int hp = stats.getOrDefault("hp", 0);
    int attack = stats.getOrDefault("attack", 0);
    int defense = stats.getOrDefault("defense", 0);
    int specialAttack = stats.getOrDefault("special-attack", 0);
    int specialDefense = stats.getOrDefault("special-defense", 0);
    int speed = stats.getOrDefault("speed", 0);
    var abilityEntries = new ArrayList<JsonNode>();
    PokeApiPayloads.items(pokemon.get("abilities")).forEach(abilityEntries::add);
    abilityEntries.sort((left, right) -> Integer.compare(PokeApiPayloads.integer(left.get("slot")),
        PokeApiPayloads.integer(right.get("slot"))));
    var relations = new ArrayList<JsonNode>();
    var abilities = new LinkedHashSet<String>();
    for (var entry : abilityEntries) {
      var id = PokeApiPayloads.nestedName(entry, "ability");
      var name = spanishAbilityNames.get(id);
      if (name == null || name.isEmpty()) throw new IllegalStateException("Missing Spanish ability name for " + id);
      Map<String, JsonNode> relation = new LinkedHashMap<>();
      relation.put("id", JsonNode.createStringNode(id));
      relation.put("name", JsonNode.createStringNode(name));
      relation.put("slot", JsonNode.createNumberNode(PokeApiPayloads.integer(entry.get("slot"))));
      relation.put("isHidden", JsonNode.createBooleanNode(PokeApiPayloads.bool(entry.get("is_hidden"))));
      relations.add(JsonNode.createObjectNode(relation));
      abilities.add(name);
    }
    var typeEntries = new ArrayList<JsonNode>();
    PokeApiPayloads.items(pokemon.get("types")).forEach(typeEntries::add);
    typeEntries.sort((left, right) -> Integer.compare(PokeApiPayloads.integer(left.get("slot")),
        PokeApiPayloads.integer(right.get("slot"))));
    var sprites = pokemon.get("sprites");
    var frontDefault = sprites == null ? null : PokeApiPayloads.nullableText(sprites.get("front_default"));
    var cries = pokemon.get("cries");
    Map<String, JsonNode> metadata = new LinkedHashMap<>();
    metadata.put("pokeApiId", JsonNode.createNumberNode(PokeApiPayloads.integer(pokemon.get("id"))));
    metadata.put("species", JsonNode.createStringNode(PokeApiPayloads.nestedName(pokemon, "species")));
    metadata.put("cries", nodeOrNull(cries));
    metadata.put("artwork", path(pokemon, "sprites", "other", "official-artwork", "front_default"));
    metadata.put("homeArtwork", path(pokemon, "sprites", "other", "home", "front_default"));
    metadata.put("shinySprite", path(pokemon, "sprites", "front_shiny"));
    metadata.put("abilityRelations", JsonNode.createArrayNode(relations));
    var legendary = PokeApiPayloads.bool(species.get("is_mythical")) ? "MYTHICAL"
        : PokeApiPayloads.bool(species.get("is_legendary")) ? "LEGENDARY" : "NORMAL";
    return new PokemonCatalogStore.PokemonRow(PokeApiPayloads.text(pokemon.get("name")), nationalDexNumber,
        isDefault ? displayName(PokeApiPayloads.nestedName(pokemon, "species")) : regionalDisplayName(pokemon),
        limits.generationFor(nationalDexNumber), isDefault,
        frontDefault != null ? frontDefault
            : "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
                + PokeApiPayloads.integer(pokemon.get("id")) + ".png",
        localized(species.get("names"), List.of("en", "es")),
        typeEntries.stream().map(entry -> PokeApiPayloads.nestedName(entry, "type")).toList(),
        hp, attack, defense, specialAttack, specialDefense, speed,
        hp + attack + defense + specialAttack + specialDefense + speed,
        PokeApiPayloads.integer(pokemon.get("height")), PokeApiPayloads.integer(pokemon.get("weight")), legendary,
        PokeApiPayloads.nestedName(species, "color"), List.copyOf(abilities), JsonNode.createObjectNode(metadata));
  }

  private void upsertPokemon(List<PokemonCatalogStore.PokemonRow> entries) {
    for (int start = 0; start < entries.size(); start += WRITE_BATCH) {
      store.upsertPokemon(entries.subList(start, Math.min(start + WRITE_BATCH, entries.size())), now());
    }
  }

  // --- Fases ------------------------------------------------------------------------------------------------------

  private void syncLearnsets(List<JsonNode> pokemon, SeederLimits limits) {
    var entries = new ArrayList<LearnsetExtractor.LevelUpEntry>();
    for (var entry : pokemon) {
      entries.addAll(LearnsetExtractor.canonicalLevelUp(PokeApiPayloads.text(entry.get("name")),
          limits.generationFor(nationalDexNumberFor(entry, limits)), PokeApiPayloads.moves(entry.get("moves"))));
    }
    Map<String, String> moveUrls = new HashMap<>();
    for (var item : pokemon) {
      for (var move : PokeApiPayloads.items(item.get("moves"))) {
        moveUrls.put(PokeApiPayloads.nestedName(move, "move"), PokeApiPayloads.text(move.get("move").get("url")));
      }
    }
    var moveNames = new ArrayList<>(new LinkedHashSet<>(entries.stream().map(LearnsetExtractor.LevelUpEntry::moveId).toList()));
    var moves = new ArrayList<JsonNode>();
    for (int start = 0; start < moveNames.size(); start += BATCH_SIZE) {
      var names = moveNames.subList(start, Math.min(start + BATCH_SIZE, moveNames.size()));
      moves.addAll(concurrently(names, name -> fetchJson(urls.resolve(moveUrls.get(name)), "move " + name)));
      LOG.info("Loaded move metadata {}-{} / {}", start + 1, Math.min(start + BATCH_SIZE, moveNames.size()),
          moveNames.size());
    }
    var rows = moves.stream().map(PokemonCatalogSeeder::moveRow).toList();
    for (int start = 0; start < rows.size(); start += WRITE_BATCH) {
      store.upsertMoves(rows.subList(start, Math.min(start + WRITE_BATCH, rows.size())), now());
    }
    store.replaceLearnsets(pokemon.stream().map(entry -> PokeApiPayloads.text(entry.get("name"))).toList(), entries);
    LOG.info("Seeded {} canonical level-up entries across {} moves.", entries.size(), moves.size());
  }

  private static PokemonCatalogStore.MoveRow moveRow(JsonNode move) {
    var id = PokeApiPayloads.text(move.get("name"));
    String english = null;
    for (var entry : PokeApiPayloads.names(move.get("names"))) {
      if (entry.language().equals("en")) {
        english = entry.name();
        break;
      }
    }
    var priority = PokeApiPayloads.nullableInteger(move.get("priority"));
    return new PokemonCatalogStore.MoveRow(id, english != null ? english : displayName(id),
        PokeApiPayloads.nestedName(move, "type"), PokeApiPayloads.nestedName(move, "damage_class"),
        localized(move.get("names"), List.of("en", "es")), PokeApiPayloads.nullableInteger(move.get("power")),
        PokeApiPayloads.nullableInteger(move.get("accuracy")), PokeApiPayloads.nullableInteger(move.get("pp")),
        priority == null ? 0 : priority, trailingId(path(move, "generation", "url")));
  }

  /** {@code Number(/\/(\d+)\/?$/.exec(url ?? '')?.[1]) || null}. */
  private static @Nullable Integer trailingId(@Nullable JsonNode url) {
    var text = url != null && url.isString() ? url.getStringValue() : "";
    var match = TRAILING_ID.matcher(text);
    if (!match.find()) return null;
    try {
      int value = Integer.parseInt(match.group(1));
      return value == 0 ? null : value;
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private void syncEvolution(List<JsonNode> defaultPokemon, List<JsonNode> species) {
    Map<String, String> parent = new HashMap<>();
    Map<String, List<String>> children = new HashMap<>();
    for (var entry : species) {
      var name = PokeApiPayloads.text(entry.get("name"));
      var from = PokeApiPayloads.nestedName(entry, "evolves_from_species");
      parent.put(name, from.isEmpty() ? null : from);
      if (!from.isEmpty()) children.computeIfAbsent(from, ignored -> new ArrayList<>()).add(name);
    }
    var evolution = new Evolution(parent, children);
    Map<String, String> pokemonIdBySpecies = new LinkedHashMap<>();
    for (var entry : defaultPokemon) {
      pokemonIdBySpecies.put(PokeApiPayloads.nestedName(entry, "species"), PokeApiPayloads.text(entry.get("name")));
    }
    var updates = new ArrayList<PokemonCatalogStore.EvolutionUpdate>();
    var edges = new ArrayList<PokemonCatalogStore.EvolutionEdge>();
    for (var entry : species) {
      var name = PokeApiPayloads.text(entry.get("name"));
      var pokemonId = pokemonIdBySpecies.get(name);
      if (pokemonId != null) {
        int stages = evolution.depth(evolution.root(name));
        // Un miembro terminal de una rama corta se normaliza como «final» aunque otra rama de la familia tenga una
        // etapa intermedia más.
        int normalized = children.getOrDefault(name, List.of()).isEmpty() ? stages : evolution.stage(name);
        updates.add(new PokemonCatalogStore.EvolutionUpdate(pokemonId, normalized, stages));
      }
      var from = PokeApiPayloads.nestedName(entry, "evolves_from_species");
      var fromId = from.isEmpty() ? null : pokemonIdBySpecies.get(from);
      if (fromId == null || pokemonId == null) continue;
      var chainId = trailingId(path(entry, "evolution_chain", "url"));
      int chain = chainId != null ? chainId : PokeApiPayloads.integer(entry.get("id"));
      edges.add(new PokemonCatalogStore.EvolutionEdge(chain + ":" + fromId + ":" + pokemonId, chain, fromId, pokemonId));
    }
    store.replaceEvolution(updates, List.copyOf(pokemonIdBySpecies.values()), edges, now());
    LOG.info("Seeded evolution position for {} Pokémon.", updates.size());
  }

  /** Posición evolutiva con memoria, como las clausuras {@code stage}, {@code depth} y {@code root} de Node. */
  private record Evolution(Map<String, String> parent, Map<String, List<String>> children) {

    int stage(String name) {
      var from = parent.get(name);
      return from != null ? stage(from) + 1 : 1;
    }

    int depth(String name) {
      int deepest = 0;
      for (var child : children.getOrDefault(name, List.of())) deepest = Math.max(deepest, depth(child));
      return 1 + deepest;
    }

    String root(String name) {
      var current = name;
      while (parent.get(current) != null) current = parent.get(current);
      return current;
    }
  }

  private void syncNormalizedSpecies(List<JsonNode> species, SeederLimits limits) {
    var generations = new LinkedHashSet<Integer>();
    for (var entry : species) generations.add(limits.generationFor(PokeApiPayloads.integer(entry.get("id"))));
    for (var id : generations) store.createGenerationIfMissing(id, now());
    Map<String, Integer> idsByName = new HashMap<>();
    for (var entry : species) idsByName.putIfAbsent(PokeApiPayloads.text(entry.get("name")), PokeApiPayloads.integer(entry.get("id")));
    for (var entry : species) {
      int id = PokeApiPayloads.integer(entry.get("id"));
      var name = PokeApiPayloads.text(entry.get("name"));
      var from = PokeApiPayloads.nestedName(entry, "evolves_from_species");
      var row = new PokemonCatalogStore.SpeciesRow(id, name, limits.generationFor(id), displayName(name),
          localized(entry.get("names"), null), PokeApiPayloads.nestedName(entry, "color"),
          nullableName(entry, "shape"), nullableName(entry, "habitat"), nullableName(entry, "growth_rate"),
          PokeApiPayloads.nullableInteger(entry.get("gender_rate")),
          PokeApiPayloads.nullableInteger(entry.get("capture_rate")),
          PokeApiPayloads.nullableInteger(entry.get("base_happiness")),
          PokeApiPayloads.nullableInteger(entry.get("hatch_counter")), PokeApiPayloads.bool(entry.get("is_baby")),
          PokeApiPayloads.bool(entry.get("is_legendary")), PokeApiPayloads.bool(entry.get("is_mythical")),
          PokeApiPayloads.bool(entry.get("has_gender_differences")),
          PokeApiPayloads.bool(entry.get("forms_switchable")), from.isEmpty() ? null : idsByName.get(from),
          trailingId(path(entry, "evolution_chain", "url")));
      var numbers = new ArrayList<PokemonCatalogStore.PokedexNumber>();
      for (var item : PokeApiPayloads.items(entry.get("pokedex_numbers"))) {
        numbers.add(new PokemonCatalogStore.PokedexNumber(PokeApiPayloads.nestedName(item, "pokedex"),
            PokeApiPayloads.integer(item.get("entry_number"))));
      }
      store.upsertSpecies(row, numbers, now());
    }
  }

  /** {@code entry.shape?.name ?? null}. */
  private static @Nullable String nullableName(JsonNode entry, String field) {
    var child = entry.get(field);
    return child == null || !child.isObject() ? null : PokeApiPayloads.nullableText(child.get("name"));
  }

  private void syncPokedexEntries(List<JsonNode> defaultPokemon, List<JsonNode> species, SeederLimits limits) {
    Map<String, JsonNode> speciesByName = new HashMap<>();
    for (var entry : species) speciesByName.put(PokeApiPayloads.text(entry.get("name")), entry);
    if (!species.isEmpty()) syncNormalizedSpecies(species, limits);
    var entries = new ArrayList<PokedexEntryExtractor.Entry>();
    for (var pokemon : defaultPokemon) {
      var source = speciesByName.get(PokeApiPayloads.nestedName(pokemon, "species"));
      if (source == null) continue;
      entries.addAll(PokedexEntryExtractor.spanishEntries(PokeApiPayloads.text(pokemon.get("name")),
          PokeApiPayloads.flavorTexts(source.get("flavor_text_entries"))));
    }
    if (entries.size() < limits.minPokedexEntries()) {
      throw new IllegalStateException("Expected at least " + limits.minPokedexEntries()
          + " Spanish Pokédex entries, received " + entries.size());
    }
    store.replacePokedexEntries(defaultPokemon.stream().map(pokemon -> PokeApiPayloads.text(pokemon.get("name"))).toList(),
        entries);
    LOG.info("Seeded {} official Spanish Pokédex entries.", entries.size());
  }

  private Instant now() {
    return Instant.ofEpochMilli(clock.now());
  }
}
