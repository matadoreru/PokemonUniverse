package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.gameconfigs.StoredUserGameConfig;
import es.pokemonuniverse.application.gameconfigs.UserGameConfigStore;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.StreamSupport;
import javax.sql.DataSource;

/**
 * {@code PrismaUserGameConfigRepository} sobre JPA. El upsert es un único {@code INSERT ... ON CONFLICT} sobre la
 * unicidad {@code (userId, gameId)}: crea la fila con un id nuevo o sustituye {@code config} y {@code updatedAt}.
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaUserGameConfigStore implements UserGameConfigStore {

  private static final String UPSERT = """
      INSERT INTO "UserGameConfig" ("id", "userId", "gameId", "config", "createdAt", "updatedAt")
      VALUES (?1, ?2, ?3, CAST(?4 AS jsonb), ?5, ?5)
      ON CONFLICT ("userId", "gameId")
      DO UPDATE SET "config" = EXCLUDED."config", "updatedAt" = EXCLUDED."updatedAt"
      """;

  private final UserGameConfigRepository repository;
  private final EntityManager entityManager;
  private final JsonMapper json;
  private final Clock clock;

  /** {@code migrations} fuerza el orden fuera de test: el esquema está migrado antes de la carga inicial. */
  public JpaUserGameConfigStore(@Nullable FlywayMigrations migrations, UserGameConfigRepository repository,
      EntityManager entityManager, JsonMapper json, Clock clock) {
    this.repository = repository;
    this.entityManager = entityManager;
    this.json = json;
    this.clock = clock;
  }

  @Override
  @Transactional
  public List<StoredUserGameConfig> list() {
    return StreamSupport.stream(repository.findAll().spliterator(), false)
        .map(row -> new StoredUserGameConfig(row.getUserId(), row.getGameId(), parse(row.getConfig())))
        .toList();
  }

  @Override
  @Transactional
  public void upsert(String userId, String gameId, JsonNode config) {
    entityManager.createNativeQuery(UPSERT)
        .setParameter(1, UUID.randomUUID().toString())
        .setParameter(2, userId)
        .setParameter(3, gameId)
        .setParameter(4, serialize(config))
        .setParameter(5, Timestamp.from(Instant.ofEpochMilli(clock.now())))
        .executeUpdate();
  }

  private JsonNode parse(String text) {
    try {
      return json.readValue(text, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private String serialize(JsonNode config) {
    try {
      return json.writeValueAsString(config);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
