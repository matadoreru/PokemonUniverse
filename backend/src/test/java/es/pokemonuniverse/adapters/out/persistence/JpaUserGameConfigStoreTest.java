package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.gameconfigs.StoredUserGameConfig;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

/** {@code PrismaUserGameConfigRepository} contra Postgres real: upsert por {@code (userId, gameId)} y lectura cruda. */
@MicronautTest(transactional = false)
class JpaUserGameConfigStoreTest {

  @Inject JpaUserGameConfigStore store;
  @Inject UserGameConfigRepository repository;
  @Inject UserRepository users;
  @Inject ObjectMapper mapper;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  private String user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    return users.save(UserEntity.create(UUID.randomUUID().toString(), "g_" + tag, tag + "@mail.com", "h", Instant.now()))
        .getId();
  }

  private JsonNode json(String text) throws IOException {
    return mapper.readValue(text, JsonNode.class);
  }

  private List<StoredUserGameConfig> rowsOf(String userId) {
    return store.list().stream().filter(row -> row.userId().equals(userId)).toList();
  }

  @Test
  void upsertCreatesThenReplacesTheSingleRowOfAUserAndGame() throws IOException {
    var owner = user();
    store.upsert(owner, "higher-lower", json("{\"rounds\":3,\"generations\":[1]}"));
    var created = repository.findByUserIdAndGameId(owner, "higher-lower").orElseThrow();
    store.upsert(owner, "higher-lower", json("{\"rounds\":4,\"generations\":[2]}"));
    store.upsert(owner, "pokedex-distance", json("{\"roundSeconds\":20}"));
    var rows = rowsOf(owner);
    assertEquals(2, rows.size());
    var higherLower = rows.stream().filter(row -> row.gameId().equals("higher-lower")).findFirst().orElseThrow();
    assertTrue(JsonTree.equal(json("{\"rounds\":4,\"generations\":[2]}"), higherLower.config()));
    var updated = repository.findByUserIdAndGameId(owner, "higher-lower").orElseThrow();
    assertEquals(created.getId(), updated.getId());
    assertEquals(created.getCreatedAt(), updated.getCreatedAt());
    assertTrue(!updated.getUpdatedAt().isBefore(created.getUpdatedAt()));
  }

  /**
   * Las columnas {@code TIMESTAMP(3)} sin zona guardan UTC, como Prisma, aunque la JVM corra en otra zona
   * ({@link NonUtcZone}): se lee el valor crudo, no vía Hibernate.
   */
  @Test
  void timestampsAreStoredInUtc() throws IOException, SQLException {
    var owner = user();
    try (var zone = NonUtcZone.pin()) {
      store.upsert(owner, "higher-lower", json("{\"rounds\":3}"));
    }
    try (var connection = resolver.resolve(dataSource).getConnection();
        var query = connection.prepareStatement("""
            SELECT EXTRACT(EPOCH FROM "createdAt"), EXTRACT(EPOCH FROM "updatedAt")
            FROM "UserGameConfig" WHERE "userId" = ?""")) {
      query.setString(1, owner);
      try (var rows = query.executeQuery()) {
        assertTrue(rows.next());
        long now = System.currentTimeMillis() / 1000;
        assertTrue(Math.abs(rows.getDouble(1) - now) < 60, "createdAt " + rows.getDouble(1) + " vs " + now);
        assertTrue(Math.abs(rows.getDouble(2) - now) < 60, "updatedAt " + rows.getDouble(2) + " vs " + now);
      }
    }
  }

  @Test
  void readsRowsWhoseJsonIsNotAnObject() throws IOException {
    var owner = user();
    store.upsert(owner, "higher-lower", json("\"corrupto\""));
    store.upsert(owner, "pokemon-bingo", json("[1,2]"));
    store.upsert(owner, "poke-taboo", JsonNode.nullNode());
    var rows = rowsOf(owner);
    assertEquals(3, rows.size());
    for (var row : rows) {
      var expected = switch (row.gameId()) {
        case "higher-lower" -> json("\"corrupto\"");
        case "pokemon-bingo" -> json("[1,2]");
        default -> JsonNode.nullNode();
      };
      assertTrue(JsonTree.equal(expected, row.config()), row.gameId() + ": " + row.config());
    }
  }
}
