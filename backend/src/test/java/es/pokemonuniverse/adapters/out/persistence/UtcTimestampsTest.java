package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncRecords;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.pokemon.PokemonCatalogStore;
import es.pokemonuniverse.application.gameconfigs.UserGameConfigStore;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.annotation.MockBean;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

/**
 * Las columnas {@code timestamp(3)} sin zona guardan UTC, como Prisma, aunque la JVM corra en otra zona: el adaptador
 * del catálogo Pokémon (JDBC crudo), los registros del data-sync (parámetros de Hibernate) y el upsert nativo de
 * {@code UserGameConfig} ({@code setParameter} con {@code Timestamp.from}). Se lee el valor crudo con
 * {@code EXTRACT(EPOCH ...)}, que interpreta el {@code timestamp} sin zona como UTC.
 */
@MicronautTest(transactional = false)
class UtcTimestampsTest {

  private static final Instant WINTER = Instant.parse("2026-01-15T12:00:00.123Z");
  private static final Instant SUMMER = Instant.parse("2026-07-15T12:00:00.456Z");

  @Inject PokemonCatalogStore pokemon;
  @Inject DataSyncRecords records;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject UserGameConfigStore gameConfigs;
  @Inject UserRepository users;
  @Inject ObjectMapper mapper;

  /** Reloj fijo para que el upsert de {@code UserGameConfig} escriba instantes exactos. */
  private final AtomicLong clockMillis = new AtomicLong(System.currentTimeMillis());

  @MockBean(Clock.class)
  Clock clock() {
    return clockMillis::get;
  }

  private Instant read(String sql, String key) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var query = connection.prepareStatement("SELECT EXTRACT(EPOCH FROM t) * 1000 FROM (" + sql + ") s(t)")) {
      query.setString(1, key);
      try (var rows = query.executeQuery()) {
        rows.next();
        return Instant.ofEpochMilli(Math.round(rows.getDouble(1)));
      }
    }
  }

  private void execute(String sql, String key) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement(sql)) {
      statement.setString(1, key);
      statement.executeUpdate();
    }
  }

  @Test
  void thePokemonCatalogStoreWritesUtcUnderANonUtcJvmZone() throws Exception {
    try (var zone = NonUtcZone.pin()) {
      for (var instant : new Instant[] {WINTER, SUMMER}) {
        pokemon.markSynced("utc-test", 1, instant);
        assertEquals(instant, read("SELECT \"completedAt\" FROM \"PokemonCatalogSync\" WHERE \"key\" = ?", "utc-test"));
      }
    } finally {
      execute("DELETE FROM \"PokemonCatalogSync\" WHERE \"key\" = ?", "utc-test");
    }
  }

  @Test
  void theDataSyncRecordsWriteUtcUnderANonUtcJvmZone() throws Exception {
    String runId = null;
    try (var zone = NonUtcZone.pin()) {
      runId = records.createRun(DataSyncSource.TCGDEX, DataSyncMode.INITIAL, SUMMER);
      assertEquals(SUMMER, read("SELECT \"startedAt\" FROM \"DataSyncRun\" WHERE \"id\" = ?", runId));
    } finally {
      if (runId != null) execute("DELETE FROM \"DataSyncRun\" WHERE \"id\" = ?", runId);
    }
  }

  @Test
  void theUserGameConfigUpsertWritesUtcUnderANonUtcJvmZone() throws Exception {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var owner = users.save(UserEntity.create(UUID.randomUUID().toString(), "g_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    var createdAt = "SELECT \"createdAt\" FROM \"UserGameConfig\" WHERE \"userId\" = ?";
    try (var zone = NonUtcZone.pin()) {
      clockMillis.set(WINTER.toEpochMilli());
      gameConfigs.upsert(owner, "higher-lower", mapper.readValue("{\"rounds\":3}", JsonNode.class));
      assertEquals(WINTER, read(createdAt, owner));
      clockMillis.set(SUMMER.toEpochMilli());
      gameConfigs.upsert(owner, "higher-lower", mapper.readValue("{\"rounds\":4}", JsonNode.class));
      assertEquals(SUMMER, read("SELECT \"updatedAt\" FROM \"UserGameConfig\" WHERE \"userId\" = ?", owner));
      assertEquals(WINTER, read(createdAt, owner));
    } finally {
      clockMillis.set(System.currentTimeMillis());
      execute("DELETE FROM \"UserGameConfig\" WHERE \"userId\" = ?", owner);
    }
  }
}
