package es.pokemonuniverse.application.datasync.pokemon;

import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.PokemonPaletteCount;
import es.pokemonuniverse.application.datasync.SyncResult;
import es.pokemonuniverse.application.ports.SyncHttp;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.json.tree.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * {@code PokemonDataSync} de {@code pokemon-data-sync.ts}, origen {@code POKEAPI}.
 *
 * <p>INCREMENTAL con al menos 100 paletas pregunta {@code pokemon-species?limit=1} y, si el recuento remoto no supera
 * el número local de filas de {@code "Pokemon"} (formas incluidas), se salta sin descargar nada. Es el atajo de Node
 * con su defecto conocido: con las formas sembradas la comparación siempre se cumple, así que una especie nueva no se
 * detecta en INCREMENTAL (anotado en {@code docs/migracion-java-pendientes.md}). En los demás casos ejecuta el
 * sembrador (FULL fuerza todas las fases), {@code backfillNormalizedData} y las paletas que falten.
 */
public class PokemonDataSync implements DataSyncAdapter {

  private final PokemonCatalogStore store;
  private final PokemonCatalogSeeder seeder;
  private final PokemonPaletteSync palettes;
  private final SyncHttp http;
  private final PokeApiUrls urls;
  private final SeederLimits limits;
  private final Clock clock;

  public PokemonDataSync(PokemonCatalogStore store, PokemonCatalogSeeder seeder, PokemonPaletteSync palettes,
      SyncHttp http, PokeApiUrls urls, SeederLimits limits, Clock clock) {
    this.store = store;
    this.seeder = seeder;
    this.palettes = palettes;
    this.http = http;
    this.urls = urls;
    this.limits = limits;
    this.clock = clock;
  }

  @Override
  public DataSyncSource source() {
    return DataSyncSource.POKEAPI;
  }

  @Override
  public SyncResult run(DataSyncMode mode) {
    long before = store.countPokemon();
    if (mode == DataSyncMode.INCREMENTAL) {
      long paletteCount = palettes.persisted();
      if (paletteCount >= PokemonPaletteCount.MIN_PLAYABLE) {
        var remote = http.json(urls.endpoint("pokemon-species?limit=1"), "PokéAPI species version").get("count");
        if (remote != null && remote.isNumber() && remote.getNumberValue().doubleValue() <= before) {
          Map<String, JsonNode> details = new LinkedHashMap<>();
          details.put("changeDetected", JsonNode.createBooleanNode(false));
          details.put("paletteCount", JsonNode.createNumberNode(paletteCount));
          return new SyncResult(0, 0, 0, Math.toIntExact(before), jsNumber(remote.getNumberValue()),
              JsonNode.createObjectNode(details));
        }
      }
    }
    seeder.sync(mode == DataSyncMode.FULL, limits);
    backfillNormalizedData();
    var result = palettes.syncMissing();
    long after = store.countPokemon();
    Map<String, JsonNode> counts = new LinkedHashMap<>();
    counts.put("processed", JsonNode.createNumberNode(result.processed()));
    counts.put("updated", JsonNode.createNumberNode(result.updated()));
    counts.put("skipped", JsonNode.createNumberNode(result.skipped()));
    counts.put("failed", JsonNode.createNumberNode(result.failed()));
    return new SyncResult(Math.toIntExact(after), Math.toIntExact(Math.max(0, after - before)),
        Math.toIntExact(Math.min(before, after)), mode == DataSyncMode.INCREMENTAL && after == before
            ? Math.toIntExact(after) : 0,
        String.valueOf(after), JsonNode.createObjectNode(Map.of("palettes", JsonNode.createObjectNode(counts))));
  }

  @Override
  public long recordsAvailable() {
    return store.countPlayableDefault();
  }

  /**
   * Mantiene las tablas normalizadas compatibles con el catálogo: generaciones, especie mínima por Pokémon por defecto
   * y, por cada fila en su propia transacción, {@code speciesId} y las relaciones reconciliadas.
   */
  void backfillNormalizedData() {
    var rows = store.allPokemon();
    var now = Instant.ofEpochMilli(clock.now());
    var generations = new LinkedHashSet<Integer>();
    for (var row : rows) generations.add(row.generation());
    for (var generation : generations) store.createGenerationIfMissing(generation, now);
    Map<Integer, PokemonCatalogStore.StoredPokemon> defaults = new LinkedHashMap<>();
    for (var row : rows) if (row.isDefault()) defaults.put(row.nationalDexNumber(), row);
    for (var row : defaults.values()) store.upsertSpeciesStub(row, now);
    for (var row : rows) {
      var metadata = row.metadata() != null && row.metadata().isObject() ? row.metadata() : null;
      var input = new PokemonRelationReconciler.Input(row.id(),
          PokemonRelationReconciler.desiredAbilitiesFromMetadata(metadata, row.abilities()), types(row), stats(row),
          assets(row, metadata));
      store.backfillPokemon(row.id(), row.nationalDexNumber(), Instant.ofEpochMilli(clock.now()),
          tx -> PokemonRelationReconciler.reconcile(tx, input));
    }
  }

  private static List<PokemonRelationReconciler.DesiredType> types(PokemonCatalogStore.StoredPokemon row) {
    var types = new ArrayList<PokemonRelationReconciler.DesiredType>();
    for (int i = 0; i < row.types().size(); i++) {
      types.add(new PokemonRelationReconciler.DesiredType(row.types().get(i), i + 1));
    }
    return types;
  }

  private static List<PokemonRelationReconciler.DesiredStat> stats(PokemonCatalogStore.StoredPokemon row) {
    return List.of(new PokemonRelationReconciler.DesiredStat("hp", row.hp(), 0),
        new PokemonRelationReconciler.DesiredStat("attack", row.attack(), 0),
        new PokemonRelationReconciler.DesiredStat("defense", row.defense(), 0),
        new PokemonRelationReconciler.DesiredStat("special-attack", row.specialAttack(), 0),
        new PokemonRelationReconciler.DesiredStat("special-defense", row.specialDefense(), 0),
        new PokemonRelationReconciler.DesiredStat("speed", row.speed(), 0),
        new PokemonRelationReconciler.DesiredStat("bst", row.baseStatTotal(), 0));
  }

  /** SPRITE y ARTWORK son principales; solo se incluyen las URL de texto no vacías. */
  private static List<PokemonRelationReconciler.DesiredAsset> assets(PokemonCatalogStore.StoredPokemon row,
      JsonNode metadata) {
    var cries = metadata == null ? null : metadata.get("cries");
    if (cries != null && !cries.isObject()) cries = null;
    var candidates = new ArrayList<PokemonRelationReconciler.DesiredAsset>();
    add(candidates, "SPRITE", JsonNode.createStringNode(row.sprite()), true);
    add(candidates, "SHINY_SPRITE", metadata == null ? null : metadata.get("shinySprite"), false);
    add(candidates, "ARTWORK", metadata == null ? null : metadata.get("artwork"), true);
    add(candidates, "HOME_ARTWORK", metadata == null ? null : metadata.get("homeArtwork"), false);
    add(candidates, "CRY_LATEST", cries == null ? null : cries.get("latest"), false);
    add(candidates, "CRY_LEGACY", cries == null ? null : cries.get("legacy"), false);
    return candidates;
  }

  private static void add(List<PokemonRelationReconciler.DesiredAsset> assets, String kind, JsonNode value,
      boolean primary) {
    if (value != null && value.isString() && !value.getStringValue().isEmpty()) {
      assets.add(new PokemonRelationReconciler.DesiredAsset(kind, value.getStringValue(), primary));
    }
  }

  /** {@code String(n)} de JavaScript para un recuento: sin {@code .0} si es entero. */
  static String jsNumber(Number value) {
    double number = value.doubleValue();
    if (number == Math.rint(number) && Math.abs(number) < 1e21) return String.valueOf((long) number);
    return String.valueOf(number);
  }
}
