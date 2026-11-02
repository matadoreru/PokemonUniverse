package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.datasync.pokemon.LearnsetExtractor;
import es.pokemonuniverse.application.datasync.pokemon.PokedexEntryExtractor;
import es.pokemonuniverse.application.datasync.pokemon.PokemonCatalogStore;
import es.pokemonuniverse.application.datasync.pokemon.PokemonRelationStore;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import javax.sql.DataSource;
import org.hibernate.Session;

/**
 * Escritura del catálogo de Pokémon de la sincronización con PokéAPI sobre las tablas de Prisma. SQL nativo por JDBC
 * dentro de la transacción de Hibernate ({@link Session#doWork}): los upserts de Prisma pasan a
 * {@code INSERT … ON CONFLICT} con las mismas ramas {@code create}/{@code update}, los {@code createMany} con
 * {@code skipDuplicates} a {@code ON CONFLICT DO NOTHING} en lotes, los {@code Json} a {@code jsonb} y los
 * {@code String[]} a {@code text[]}. {@code "updatedAt"} se escribe en cada inserción y actualización.
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaPokemonCatalogStore implements PokemonCatalogStore {

  private static final String COUNTS = """
      SELECT
        (SELECT count(*) FROM "Pokemon" WHERE "isDefault" AND "hp" > 0 AND cardinality("types") > 0),
        (SELECT count(*) FROM "Pokemon" WHERE NOT "isDefault"),
        (SELECT count(*) FROM "Move"),
        (SELECT count(*) FROM "PokemonLevelUpMove"),
        (SELECT count(*) FROM "Pokemon" WHERE "isDefault" AND "evolutionStage" IS NOT NULL
          AND "evolutionStages" IS NOT NULL),
        (SELECT count(*) FROM "Pokemon" WHERE "isDefault" AND "heightDecimeters" > 0 AND "weightHectograms" > 0
          AND "color" <> 'unknown' AND cardinality("abilities") > 0),
        (SELECT count(*) FROM "PokedexEntry" WHERE "language" = 'es')
      """;
  private static final String UPSERT_POKEMON = """
      INSERT INTO "Pokemon" ("id", "nationalDexNumber", "name", "generation", "isDefault", "sprite", "names", "types",
        "hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal", "heightDecimeters",
        "weightHectograms", "legendaryStatus", "color", "abilities", "metadata", "sourceUpdatedAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?)
      ON CONFLICT ("id") DO UPDATE SET "nationalDexNumber" = EXCLUDED."nationalDexNumber", "name" = EXCLUDED."name",
        "generation" = EXCLUDED."generation", "isDefault" = EXCLUDED."isDefault", "sprite" = EXCLUDED."sprite",
        "names" = EXCLUDED."names", "types" = EXCLUDED."types", "hp" = EXCLUDED."hp", "attack" = EXCLUDED."attack",
        "defense" = EXCLUDED."defense", "specialAttack" = EXCLUDED."specialAttack",
        "specialDefense" = EXCLUDED."specialDefense", "speed" = EXCLUDED."speed",
        "baseStatTotal" = EXCLUDED."baseStatTotal", "heightDecimeters" = EXCLUDED."heightDecimeters",
        "weightHectograms" = EXCLUDED."weightHectograms", "legendaryStatus" = EXCLUDED."legendaryStatus",
        "color" = EXCLUDED."color", "abilities" = EXCLUDED."abilities", "metadata" = EXCLUDED."metadata",
        "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt", "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String UPSERT_MOVE = """
      INSERT INTO "Move" ("id", "name", "type", "category", "names", "power", "accuracy", "pp", "priority",
        "generation", "metadata", "updatedAt")
      VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
      ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "type" = EXCLUDED."type",
        "category" = EXCLUDED."category", "names" = EXCLUDED."names", "power" = EXCLUDED."power",
        "accuracy" = EXCLUDED."accuracy", "pp" = EXCLUDED."pp", "priority" = EXCLUDED."priority",
        "generation" = EXCLUDED."generation", "metadata" = EXCLUDED."metadata", "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String INSERT_LEARNSET = """
      INSERT INTO "PokemonLevelUpMove" ("pokemonId", "moveId", "referenceGeneration", "level") VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING
      """;
  private static final String INSERT_EDGE = """
      INSERT INTO "PokemonEvolution" ("id", "chainId", "fromPokemonId", "toPokemonId", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
      """;
  private static final String CREATE_GENERATION = """
      INSERT INTO "PokemonGeneration" ("id", "slug", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)
      ON CONFLICT ("id") DO NOTHING
      """;
  private static final String UPSERT_SPECIES = """
      INSERT INTO "PokemonSpecies" ("id", "slug", "generationId", "name", "names", "color", "shape", "habitat",
        "growthRate", "genderRate", "captureRate", "baseHappiness", "hatchCounter", "isBaby", "isLegendary",
        "isMythical", "hasGenderDifferences", "formsSwitchable", "evolvesFromSpeciesId", "evolutionChainId",
        "metadata", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?)
      ON CONFLICT ("id") DO UPDATE SET "generationId" = EXCLUDED."generationId", "names" = EXCLUDED."names",
        "color" = EXCLUDED."color", "shape" = EXCLUDED."shape", "habitat" = EXCLUDED."habitat",
        "growthRate" = EXCLUDED."growthRate", "genderRate" = EXCLUDED."genderRate",
        "captureRate" = EXCLUDED."captureRate", "baseHappiness" = EXCLUDED."baseHappiness",
        "hatchCounter" = EXCLUDED."hatchCounter", "isBaby" = EXCLUDED."isBaby", "isLegendary" = EXCLUDED."isLegendary",
        "isMythical" = EXCLUDED."isMythical", "hasGenderDifferences" = EXCLUDED."hasGenderDifferences",
        "formsSwitchable" = EXCLUDED."formsSwitchable", "evolvesFromSpeciesId" = EXCLUDED."evolvesFromSpeciesId",
        "evolutionChainId" = EXCLUDED."evolutionChainId", "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String UPSERT_SPECIES_STUB = """
      INSERT INTO "PokemonSpecies" ("id", "slug", "generationId", "name", "names", "color", "isLegendary",
        "isMythical", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?, ?)
      ON CONFLICT ("id") DO UPDATE SET "generationId" = EXCLUDED."generationId", "name" = EXCLUDED."name",
        "names" = EXCLUDED."names", "color" = EXCLUDED."color", "isLegendary" = EXCLUDED."isLegendary",
        "isMythical" = EXCLUDED."isMythical", "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String INSERT_POKEDEX_ENTRY = """
      INSERT INTO "PokedexEntry" ("id", "pokemonId", "text", "language", "generation", "version", "versionLabel")
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
      """;
  private static final String MARK_SYNCED = """
      INSERT INTO "PokemonCatalogSync" ("key", "version", "completedAt") VALUES (?, ?, ?)
      ON CONFLICT ("key") DO UPDATE SET "version" = EXCLUDED."version", "completedAt" = EXCLUDED."completedAt"
      """;
  private static final String ALL_POKEMON = """
      SELECT "id", "nationalDexNumber", "generation", "isDefault", "name", CAST("names" AS text), "color",
        "legendaryStatus", "types", "abilities", "sprite", CAST("metadata" AS text), "hp", "attack", "defense",
        "specialAttack", "specialDefense", "speed", "baseStatTotal"
      FROM "Pokemon" ORDER BY "nationalDexNumber", "id"
      """;
  private static final int CHUNK = 1_000;

  private final EntityManager entityManager;
  private final JsonMapper json;

  public JpaPokemonCatalogStore(EntityManager entityManager, JsonMapper json) {
    this.entityManager = entityManager;
    this.json = json;
  }

  // --- Acceso JDBC -------------------------------------------------------------------------------------------------

  @FunctionalInterface
  private interface SqlWork<T> {
    T run(Connection connection) throws SQLException;
  }

  @FunctionalInterface
  private interface RowMapper<T> {
    T map(ResultSet row) throws SQLException;
  }

  /** Valor {@code text[]}: se crea con la conexión al enlazar. */
  private record TextArray(List<String> values) {}

  /** Nulo con tipo SQL explícito. */
  private record Null(int sqlType) {}

  private <T> T jdbc(SqlWork<T> work) {
    // El EntityManager inyectado es la sesión transaccional de Micronaut (ya implementa Session).
    var session = entityManager instanceof Session current ? current : entityManager.unwrap(Session.class);
    return session.doReturningWork(work::run);
  }

  private static void bind(Connection connection, PreparedStatement statement, Object... params) throws SQLException {
    for (int i = 0; i < params.length; i++) {
      var value = params[i];
      switch (value) {
        case null -> statement.setNull(i + 1, Types.VARCHAR);
        case Null typed -> statement.setNull(i + 1, typed.sqlType());
        case TextArray array -> statement.setArray(i + 1, connection.createArrayOf("text", array.values().toArray()));
        // Columnas timestamp(3) sin zona en UTC (Prisma): Timestamp.from usaría la zona de la JVM y
        // hibernate.jdbc.time_zone no se aplica a los PreparedStatement crudos.
        case Instant instant -> statement.setObject(i + 1, LocalDateTime.ofInstant(instant, ZoneOffset.UTC));
        default -> statement.setObject(i + 1, value);
      }
    }
  }

  private int update(String sql, Object... params) {
    return jdbc(connection -> {
      try (var statement = connection.prepareStatement(sql)) {
        bind(connection, statement, params);
        return statement.executeUpdate();
      }
    });
  }

  private void batch(String sql, List<Object[]> rows) {
    for (int start = 0; start < rows.size(); start += CHUNK) {
      var chunk = rows.subList(start, Math.min(start + CHUNK, rows.size()));
      jdbc(connection -> {
        try (var statement = connection.prepareStatement(sql)) {
          for (var row : chunk) {
            bind(connection, statement, row);
            statement.addBatch();
          }
          statement.executeBatch();
        }
        return null;
      });
    }
  }

  private <T> List<T> query(String sql, RowMapper<T> mapper, Object... params) {
    return jdbc(connection -> {
      try (var statement = connection.prepareStatement(sql)) {
        bind(connection, statement, params);
        try (var rows = statement.executeQuery()) {
          var result = new ArrayList<T>();
          while (rows.next()) result.add(mapper.map(rows));
          return result;
        }
      }
    });
  }

  private static Object integer(@Nullable Integer value) {
    return value == null ? new Null(Types.INTEGER) : value;
  }

  private static Object text(@Nullable String value) {
    return value == null ? new Null(Types.VARCHAR) : value;
  }

  private String write(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private @Nullable JsonNode read(@Nullable String value) {
    if (value == null) return null;
    try {
      return json.readValue(value, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static List<String> strings(@Nullable Array array) throws SQLException {
    return array == null ? List.of() : Arrays.stream((Object[]) array.getArray()).map(String.class::cast).toList();
  }

  // --- Sincronización base -----------------------------------------------------------------------------------------

  @Override
  @Transactional
  public Counts counts(Collection<String> syncKeys) {
    var counts = query(COUNTS, row -> new long[] {row.getLong(1), row.getLong(2), row.getLong(3), row.getLong(4),
        row.getLong(5), row.getLong(6), row.getLong(7)}).getFirst();
    Map<String, Integer> versions = new HashMap<>();
    query("SELECT \"key\", \"version\" FROM \"PokemonCatalogSync\" WHERE \"key\" = ANY(?)",
        row -> versions.put(row.getString(1), row.getInt(2)), new TextArray(List.copyOf(syncKeys)));
    return new Counts(counts[0], counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], versions);
  }

  @Override
  @Transactional
  public void upsertPokemon(List<PokemonRow> rows, Instant now) {
    batch(UPSERT_POKEMON, rows.stream().map(row -> new Object[] {row.id(), row.nationalDexNumber(), row.name(),
        row.generation(), row.isDefault(), row.sprite(), write(row.names()), new TextArray(row.types()), row.hp(),
        row.attack(), row.defense(), row.specialAttack(), row.specialDefense(), row.speed(), row.baseStatTotal(),
        row.heightDecimeters(), row.weightHectograms(), row.legendaryStatus(), row.color(),
        new TextArray(row.abilities()), write(row.metadata()), now, now}).toList());
  }

  @Override
  @Transactional
  public void upsertMoves(List<MoveRow> rows, Instant now) {
    var metadata = write(Map.of("source", "pokeapi"));
    batch(UPSERT_MOVE, rows.stream().map(row -> new Object[] {row.id(), row.name(), row.type(), row.category(),
        write(row.names()), integer(row.power()), integer(row.accuracy()), integer(row.pp()), row.priority(),
        integer(row.generation()), metadata, now}).toList());
  }

  @Override
  @Transactional
  public void replaceLearnsets(List<String> pokemonIds, List<LearnsetExtractor.LevelUpEntry> entries) {
    update("DELETE FROM \"PokemonLevelUpMove\" WHERE \"pokemonId\" = ANY(?)", new TextArray(pokemonIds));
    batch(INSERT_LEARNSET, entries.stream().map(entry -> new Object[] {entry.pokemonId(), entry.moveId(),
        entry.referenceGeneration(), entry.level()}).toList());
  }

  @Override
  @Transactional
  public void replaceEvolution(List<EvolutionUpdate> updates, List<String> pokemonIds, List<EvolutionEdge> edges,
      Instant now) {
    batch("UPDATE \"Pokemon\" SET \"evolutionStage\" = ?, \"evolutionStages\" = ?, \"updatedAt\" = ? WHERE \"id\" = ?",
        updates.stream().map(update -> new Object[] {update.stage(), update.stages(), now, update.pokemonId()}).toList());
    update("DELETE FROM \"PokemonEvolution\" WHERE \"fromPokemonId\" = ANY(?) OR \"toPokemonId\" = ANY(?)",
        new TextArray(pokemonIds), new TextArray(pokemonIds));
    batch(INSERT_EDGE, edges.stream().map(edge -> new Object[] {edge.id(), edge.chainId(), edge.fromPokemonId(),
        edge.toPokemonId(), now, now}).toList());
  }

  @Override
  @Transactional
  public void createGenerationIfMissing(int id, Instant now) {
    update(CREATE_GENERATION, id, "generation-" + id, "Generación " + id, now, now);
  }

  @Override
  @Transactional
  public void upsertSpecies(SpeciesRow species, List<PokedexNumber> numbers, Instant now) {
    update(UPSERT_SPECIES, species.id(), species.slug(), species.generationId(), species.name(), write(species.names()),
        text(species.color()), text(species.shape()), text(species.habitat()), text(species.growthRate()),
        integer(species.genderRate()), integer(species.captureRate()), integer(species.baseHappiness()),
        integer(species.hatchCounter()), species.isBaby(), species.isLegendary(), species.isMythical(),
        species.hasGenderDifferences(), species.formsSwitchable(), integer(species.evolvesFromSpeciesId()),
        integer(species.evolutionChainId()), write(Map.of("source", "pokeapi")), now, now);
    update("DELETE FROM \"PokemonPokedexNumber\" WHERE \"speciesId\" = ?", species.id());
    batch("INSERT INTO \"PokemonPokedexNumber\" (\"speciesId\", \"pokedex\", \"entryNumber\") VALUES (?, ?, ?)"
        + " ON CONFLICT DO NOTHING",
        numbers.stream().map(number -> new Object[] {species.id(), number.pokedex(), number.entryNumber()}).toList());
  }

  @Override
  @Transactional
  public void replacePokedexEntries(List<String> pokemonIds, List<PokedexEntryExtractor.Entry> entries) {
    update("DELETE FROM \"PokedexEntry\" WHERE \"pokemonId\" = ANY(?)", new TextArray(pokemonIds));
    batch(INSERT_POKEDEX_ENTRY, entries.stream().map(entry -> new Object[] {entry.pokemonId() + ":" + entry.version(),
        entry.pokemonId(), entry.text(), entry.language(), entry.generation(), entry.version(), entry.versionLabel()})
        .toList());
  }

  @Override
  @Transactional
  public void markSynced(String key, int version, Instant now) {
    update(MARK_SYNCED, key, version, now);
  }

  // --- Datos normalizados ------------------------------------------------------------------------------------------

  @Override
  @Transactional
  public List<StoredPokemon> allPokemon() {
    return query(ALL_POKEMON, row -> new StoredPokemon(row.getString(1), row.getInt(2), row.getInt(3),
        row.getBoolean(4), row.getString(5), read(row.getString(6)), row.getString(7), row.getString(8),
        strings(row.getArray(9)), strings(row.getArray(10)), row.getString(11), read(row.getString(12)),
        row.getInt(13), row.getInt(14), row.getInt(15), row.getInt(16), row.getInt(17), row.getInt(18),
        row.getInt(19)));
  }

  @Override
  @Transactional
  public void upsertSpeciesStub(StoredPokemon row, Instant now) {
    // Prisma.JsonNull: el valor JSON null, no SQL NULL.
    var names = row.names() == null ? "null" : write(row.names());
    update(UPSERT_SPECIES_STUB, row.nationalDexNumber(), row.id(), row.generation(), row.name(), names, row.color(),
        "LEGENDARY".equals(row.legendaryStatus()), "MYTHICAL".equals(row.legendaryStatus()), now, now);
  }

  @Override
  @Transactional
  public void backfillPokemon(String pokemonId, int speciesId, Instant now, Consumer<PokemonRelationStore> relations) {
    update("UPDATE \"Pokemon\" SET \"speciesId\" = ?, \"sourceUpdatedAt\" = ?, \"updatedAt\" = ? WHERE \"id\" = ?",
        speciesId, now, now, pokemonId);
    relations.accept(new Relations(now));
  }

  // --- Paletas -----------------------------------------------------------------------------------------------------

  @Override
  @Transactional
  public List<PaletteCandidate> defaultPokemonByDex() {
    return query("SELECT \"id\", \"sprite\", CAST(\"metadata\" AS text) FROM \"Pokemon\" WHERE \"isDefault\""
        + " ORDER BY \"nationalDexNumber\", \"id\"",
        row -> new PaletteCandidate(row.getString(1), row.getString(2), read(row.getString(3))));
  }

  @Override
  @Transactional
  public void updateMetadata(String pokemonId, JsonNode metadata, Instant now) {
    update("UPDATE \"Pokemon\" SET \"metadata\" = CAST(? AS jsonb), \"updatedAt\" = ? WHERE \"id\" = ?",
        write(metadata), now, pokemonId);
  }

  @Override
  @Transactional
  public long countPokemon() {
    return query("SELECT count(*) FROM \"Pokemon\"", row -> row.getLong(1)).getFirst();
  }

  @Override
  @Transactional
  public long countPlayableDefault() {
    return query("SELECT count(*) FROM \"Pokemon\" WHERE \"isDefault\" AND \"hp\" > 0", row -> row.getLong(1)).getFirst();
  }

  /** Relaciones dentro de la transacción de {@link #backfillPokemon}. */
  private final class Relations implements PokemonRelationStore {

    private final Instant now;

    Relations(Instant now) {
      this.now = now;
    }

    @Override
    public void upsertAbility(String id, String name) {
      update("""
          INSERT INTO "Ability" ("id", "name", "names", "createdAt", "updatedAt") VALUES (?, ?, CAST(? AS jsonb), ?, ?)
          ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = EXCLUDED."updatedAt"
          """, id, name, write(Map.of("es", name)), now, now);
    }

    @Override
    public List<Slot> abilitySlots(String pokemonId) {
      return query("SELECT \"abilityId\", \"slot\" FROM \"PokemonAbility\" WHERE \"pokemonId\" = ?",
          row -> new Slot(row.getString(1), row.getInt(2)), pokemonId);
    }

    @Override
    public void deleteAbilities(String pokemonId, Collection<String> abilityIds) {
      update("DELETE FROM \"PokemonAbility\" WHERE \"pokemonId\" = ? AND \"abilityId\" = ANY(?)", pokemonId,
          new TextArray(List.copyOf(abilityIds)));
    }

    @Override
    public void upsertPokemonAbility(String pokemonId, String abilityId, int slot, boolean hidden) {
      update("""
          INSERT INTO "PokemonAbility" ("pokemonId", "abilityId", "slot", "isHidden") VALUES (?, ?, ?, ?)
          ON CONFLICT ("pokemonId", "slot") DO UPDATE SET "abilityId" = EXCLUDED."abilityId",
            "isHidden" = EXCLUDED."isHidden"
          """, pokemonId, abilityId, slot, hidden);
    }

    @Override
    public void ensureType(String id) {
      update("""
          INSERT INTO "PokemonType" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)
          ON CONFLICT ("id") DO NOTHING
          """, id, id, now, now);
    }

    @Override
    public List<Slot> typeSlots(String pokemonId) {
      return query("SELECT \"typeId\", \"slot\" FROM \"PokemonTypeAssignment\" WHERE \"pokemonId\" = ?",
          row -> new Slot(row.getString(1), row.getInt(2)), pokemonId);
    }

    @Override
    public void deleteTypes(String pokemonId, Collection<String> typeIds) {
      update("DELETE FROM \"PokemonTypeAssignment\" WHERE \"pokemonId\" = ? AND \"typeId\" = ANY(?)", pokemonId,
          new TextArray(List.copyOf(typeIds)));
    }

    @Override
    public void upsertTypeAssignment(String pokemonId, String typeId, int slot) {
      update("""
          INSERT INTO "PokemonTypeAssignment" ("pokemonId", "typeId", "slot") VALUES (?, ?, ?)
          ON CONFLICT ("pokemonId", "slot") DO UPDATE SET "typeId" = EXCLUDED."typeId"
          """, pokemonId, typeId, slot);
    }

    @Override
    public List<Asset> managedAssets(String pokemonId, Collection<String> kinds) {
      return query("SELECT \"id\", \"kind\", \"url\" FROM \"PokemonAssetReference\" WHERE \"pokemonId\" = ?"
          + " AND \"kind\" = ANY(?)", row -> new Asset(row.getString(1), row.getString(2), row.getString(3)),
          pokemonId, new TextArray(List.copyOf(kinds)));
    }

    @Override
    public void deleteAssets(Collection<String> ids) {
      update("DELETE FROM \"PokemonAssetReference\" WHERE \"id\" = ANY(?)", new TextArray(List.copyOf(ids)));
    }

    @Override
    public void upsertAsset(String id, String pokemonId, String kind, String url, boolean primary) {
      update("""
          INSERT INTO "PokemonAssetReference" ("id", "pokemonId", "kind", "url", "isPrimary", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT ("pokemonId", "kind", "url") DO UPDATE SET "isPrimary" = EXCLUDED."isPrimary",
            "updatedAt" = EXCLUDED."updatedAt"
          """, id, pokemonId, kind, url, primary, now, now);
    }

    @Override
    public void deleteStatsExcept(String pokemonId, Collection<String> stats) {
      update("DELETE FROM \"PokemonStat\" WHERE \"pokemonId\" = ? AND NOT (\"stat\" = ANY(?))", pokemonId,
          new TextArray(List.copyOf(stats)));
    }

    @Override
    public void upsertStat(String pokemonId, String stat, int baseValue, int effort) {
      update("""
          INSERT INTO "PokemonStat" ("pokemonId", "stat", "baseValue", "effort") VALUES (?, ?, ?, ?)
          ON CONFLICT ("pokemonId", "stat") DO UPDATE SET "baseValue" = EXCLUDED."baseValue",
            "effort" = EXCLUDED."effort"
          """, pokemonId, stat, baseValue, effort);
    }
  }
}
