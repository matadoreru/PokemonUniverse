package es.pokemonuniverse.application.pokemon;

import es.pokemonuniverse.adapters.out.persistence.JpaPokemonAudioCatalog;
import es.pokemonuniverse.adapters.out.persistence.MoveEntity;
import es.pokemonuniverse.adapters.out.persistence.MoveRepository;
import es.pokemonuniverse.adapters.out.persistence.PokedexEntryEntity;
import es.pokemonuniverse.adapters.out.persistence.PokedexEntryRepository;
import es.pokemonuniverse.adapters.out.persistence.PokemonEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonLevelUpMoveEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonLevelUpMoveRepository;
import es.pokemonuniverse.adapters.out.persistence.PokemonRepository;
import es.pokemonuniverse.adapters.out.storage.FilesystemArtworkCatalog;
import es.pokemonuniverse.application.rooms.GameCatalogProvider;
import es.pokemonuniverse.application.rooms.GameCatalogs;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.LearnsetEntry;
import es.pokemonuniverse.domain.pokemon.Move;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionInfo;
import es.pokemonuniverse.domain.text.Collations;
import io.micronaut.context.annotation.Property;
import io.micronaut.data.model.Sort;
import jakarta.inject.Singleton;
import java.time.Duration;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Catálogo público y de partidas: carga Pokémon, movimientos, movimientos por nivel y entradas de Pokédex como
 * {@code loadPokemonCatalog} de Node, aplica el filtro de formas del catálogo y cachea el resultado una hora.
 */
@Singleton
public class PokemonCatalogService implements GameCatalogProvider {

  static final Duration TTL = Duration.ofHours(1);
  private static final Sort BASE_ORDER = Sort.of(
      Sort.Order.asc("nationalDexNumber"), Sort.Order.desc("isDefault"), Sort.Order.asc("name"),
      Sort.Order.desc("updatedAt"), Sort.Order.asc("id"));
  private static final Sort LEARNSET_ORDER = Sort.of(
      Sort.Order.asc("pokemonId"), Sort.Order.asc("referenceGeneration"), Sort.Order.asc("level"));
  private static final Sort POKEDEX_ORDER = Sort.of(
      Sort.Order.asc("pokemonId"), Sort.Order.desc("generation"), Sort.Order.asc("version"));
  /** El cargador de Node etiqueta todas las entradas como españolas. */
  private static final String POKEDEX_LANGUAGE = "es";

  private record Cached(InMemoryPokemonCatalog catalog, Instant loadedAt) {}

  private final PokemonRepository repository;
  private final MoveRepository moves;
  private final PokemonLevelUpMoveRepository learnsets;
  private final PokedexEntryRepository pokedexEntries;
  private final JpaPokemonAudioCatalog audio;
  private final Path artworkDir;
  private final AtomicReference<Cached> cache = new AtomicReference<>();

  public PokemonCatalogService(PokemonRepository repository, MoveRepository moves,
      PokemonLevelUpMoveRepository learnsets, PokedexEntryRepository pokedexEntries, JpaPokemonAudioCatalog audio,
      @Property(name = "pu.artwork-dir") String artworkDir) {
    this.repository = repository;
    this.moves = moves;
    this.learnsets = learnsets;
    this.pokedexEntries = pokedexEntries;
    this.audio = audio;
    this.artworkDir = Path.of(artworkDir);
  }

  public List<Pokemon> search(PokemonSearchQuery query) {
    var allowed = Set.copyOf(query.generations());
    var order = Comparator.comparingInt(Pokemon::nationalDexNumber)
        .thenComparing(p -> p.isDefault() ? 0 : 1)
        .thenComparing(Pokemon::name, Collations.names());
    return catalog().all().stream()
        .filter(p -> allowed.isEmpty() || allowed.contains(p.generation()))
        .filter(p -> query.includeForms() || p.isDefault())
        .sorted(order)
        .toList();
  }

  /** Instantánea cacheada del catálogo para las partidas (mismo filtro y orden que {@code loadPokemonCatalog} de Node). */
  public InMemoryPokemonCatalog catalog() {
    var current = cache.get();
    if (current == null || current.loadedAt().plus(TTL).isBefore(Instant.now())) {
      current = new Cached(load(), Instant.now());
      cache.set(current);
    }
    return current.catalog();
  }

  /**
   * Catálogos de partida como {@code index.ts} de Node: el de Pokémon, los artworks locales validados contra sus ids y
   * los gritos de la base de datos.
   */
  @Override
  public GameCatalogs loadPokemonCatalog() {
    var pokemon = catalog();
    var ids = pokemon.all().stream().map(Pokemon::id).collect(Collectors.toUnmodifiableSet());
    return new GameCatalogs(pokemon, new FilesystemArtworkCatalog(artworkDir, ids), audio.load());
  }

  /** Descarta la caché; la siguiente consulta recarga desde la base de datos. */
  public void refresh() {
    cache.set(null);
  }

  private InMemoryPokemonCatalog load() {
    var rows = repository.findAll(BASE_ORDER);
    var pokemon = new ArrayList<Pokemon>();
    var evolution = new HashMap<String, PokemonEvolutionInfo>();
    for (var row : rows) {
      pokemon.add(toPokemon(row));
      var stage = nonZero(row.getEvolutionStage());
      var stages = nonZero(row.getEvolutionStages());
      if (stage != null && stages != null) evolution.put(row.getId(), new PokemonEvolutionInfo(stage, stages));
    }
    var moveList = new ArrayList<Move>();
    for (var row : moves.findAll()) moveList.add(toMove(row));
    var learnsetList = new ArrayList<LearnsetEntry>();
    for (var row : learnsets.findAll(LEARNSET_ORDER)) learnsetList.add(toLearnset(row));
    var entryList = new ArrayList<PokedexEntry>();
    for (var row : pokedexEntries.findAll(POKEDEX_ORDER)) entryList.add(toPokedexEntry(row));
    return new InMemoryPokemonCatalog(pokemon, moveList, learnsetList, evolution, entryList);
  }

  private static Pokemon toPokemon(PokemonEntity r) {
    var metadata = r.getMetadata();
    var shiny = metadata != null && metadata.get("shinySprite") instanceof String s ? s : null;
    Map<String, Object> names = r.getNames();
    var palette = PersistedPalette.from(metadata, r.getSprite());
    return new Pokemon(r.getId(), r.getNationalDexNumber(), r.getName(), r.getGeneration(), r.getIsDefault(),
        r.getSprite(), shiny, palette == null ? null : palette.palette(),
        palette == null ? null : palette.paletteWeights(), r.getHp(), r.getAttack(), r.getDefense(),
        r.getSpecialAttack(), r.getSpecialDefense(), r.getSpeed(), r.getBaseStatTotal(), r.getHeightDecimeters(),
        r.getWeightHectograms(), nonZero(r.getEvolutionStage()), nonZero(r.getEvolutionStages()),
        r.getLegendaryStatus(), r.getColor(), list(r.getAbilities()), names, list(r.getTypes()));
  }

  private static Move toMove(MoveEntity r) {
    return new Move(r.getId(), r.getName(), r.getType(), r.getCategory(), r.getNames());
  }

  private static LearnsetEntry toLearnset(PokemonLevelUpMoveEntity r) {
    return new LearnsetEntry(r.getPokemonId(), r.getMoveId(), r.getReferenceGeneration(), r.getLevel());
  }

  private static PokedexEntry toPokedexEntry(PokedexEntryEntity r) {
    return new PokedexEntry(r.getPokemonId(), r.getText(), POKEDEX_LANGUAGE, r.getGeneration(), r.getVersion(),
        r.getVersionLabel());
  }

  private static Integer nonZero(Integer v) {
    return v == null || v == 0 ? null : v;
  }

  private static List<String> list(String[] a) {
    return a == null ? List.of() : List.of(a);
  }
}
