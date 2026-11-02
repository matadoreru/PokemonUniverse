package es.pokemonuniverse.application.datasync.pokemon;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Persistencia del catálogo de Pokémon que escribe la sincronización con PokéAPI (las llamadas Prisma de
 * {@code seed.ts}, {@code pokemon-data-sync.ts} y {@code pokemon-palette-sync.ts}). Cada método es una transacción;
 * {@code "updatedAt"} (el {@code @updatedAt} de Prisma) se escribe con el instante recibido.
 */
public interface PokemonCatalogStore {

  /** Recuentos de las puertas de {@code syncPokemonData} y las versiones de {@code "PokemonCatalogSync"}. */
  record Counts(long enrichedDefault, long regional, long moves, long learnsets, long evolution, long metadata,
      long spanishEntries, Map<String, Integer> versions) {}

  /** Fila de {@code toEntry}: lo que el upsert de {@code "Pokemon"} escribe en ambas ramas. */
  record PokemonRow(String id, int nationalDexNumber, String name, int generation, boolean isDefault, String sprite,
      Map<String, String> names, List<String> types, int hp, int attack, int defense, int specialAttack,
      int specialDefense, int speed, int baseStatTotal, int heightDecimeters, int weightHectograms,
      String legendaryStatus, String color, List<String> abilities, JsonNode metadata) {}

  record MoveRow(String id, String name, String type, String category, Map<String, String> names,
      @Nullable Integer power, @Nullable Integer accuracy, @Nullable Integer pp, int priority,
      @Nullable Integer generation) {}

  record EvolutionUpdate(String pokemonId, int stage, int stages) {}

  record EvolutionEdge(String id, int chainId, String fromPokemonId, String toPokemonId) {}

  /** Upsert de {@code syncNormalizedSpecies}: {@code slug}, {@code name} y {@code metadata} solo al crear. */
  record SpeciesRow(int id, String slug, int generationId, String name, Map<String, String> names, String color,
      @Nullable String shape, @Nullable String habitat, @Nullable String growthRate, @Nullable Integer genderRate,
      @Nullable Integer captureRate, @Nullable Integer baseHappiness, @Nullable Integer hatchCounter, boolean isBaby,
      boolean isLegendary, boolean isMythical, boolean hasGenderDifferences, boolean formsSwitchable,
      @Nullable Integer evolvesFromSpeciesId, @Nullable Integer evolutionChainId) {}

  record PokedexNumber(String pokedex, int entryNumber) {}

  /** Fila completa leída por {@code backfillNormalizedData}; {@code names} y {@code metadata} pueden ser nulos. */
  record StoredPokemon(String id, int nationalDexNumber, int generation, boolean isDefault, String name,
      @Nullable JsonNode names, String color, String legendaryStatus, List<String> types, List<String> abilities,
      String sprite, @Nullable JsonNode metadata, int hp, int attack, int defense, int specialAttack,
      int specialDefense, int speed, int baseStatTotal) {}

  record PaletteCandidate(String id, String sprite, @Nullable JsonNode metadata) {}

  Counts counts(Collection<String> syncKeys);

  void upsertPokemon(List<PokemonRow> rows, Instant now);

  void upsertMoves(List<MoveRow> rows, Instant now);

  /** Borra los learnsets de esos Pokémon e inserta las entradas ({@code skipDuplicates}). */
  void replaceLearnsets(List<String> pokemonIds, List<LearnsetExtractor.LevelUpEntry> entries);

  /** Posiciones evolutivas y aristas: borra las aristas que tocan esos Pokémon e inserta las nuevas. */
  void replaceEvolution(List<EvolutionUpdate> updates, List<String> pokemonIds, List<EvolutionEdge> edges, Instant now);

  /** Upsert de {@code "PokemonGeneration"} con {@code update: {}}: solo crea. */
  void createGenerationIfMissing(int id, Instant now);

  /** Upsert de la especie y sustitución de sus números de Pokédex. */
  void upsertSpecies(SpeciesRow species, List<PokedexNumber> numbers, Instant now);

  /** Borra las entradas de esos Pokémon e inserta las nuevas con id {@code pokemonId:version}. */
  void replacePokedexEntries(List<String> pokemonIds, List<PokedexEntryExtractor.Entry> entries);

  void markSynced(String key, int version, Instant now);

  /** Todas las filas de {@code "Pokemon"} (en orden de número nacional e id). */
  List<StoredPokemon> allPokemon();

  /** Upsert de la especie mínima de {@code backfillNormalizedData} (Prisma {@code JsonNull} si no hay nombres). */
  void upsertSpeciesStub(StoredPokemon row, Instant now);

  /**
   * En una transacción: {@code speciesId} y {@code sourceUpdatedAt} del Pokémon y después {@code relations} sobre la
   * misma transacción; cualquier error deshace todo.
   */
  void backfillPokemon(String pokemonId, int speciesId, Instant now, Consumer<PokemonRelationStore> relations);

  /** Pokémon por defecto ordenados por número nacional (y id). */
  List<PaletteCandidate> defaultPokemonByDex();

  void updateMetadata(String pokemonId, JsonNode metadata, Instant now);

  long countPokemon();

  /** {@code isDefault} y {@code hp > 0}: {@code recordsAvailable} del adaptador. */
  long countPlayableDefault();
}
