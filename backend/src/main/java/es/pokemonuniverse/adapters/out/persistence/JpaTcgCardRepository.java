package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.datasync.tcg.TcgCatalogStore;
import es.pokemonuniverse.application.datasync.tcg.TcgDexPayloads;
import es.pokemonuniverse.application.tcg.TcgCardRepository;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.JsonMapper;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.hibernate.Session;

/**
 * Catálogo TCG sobre las tablas de Prisma ({@code TcgSet}, {@code TcgCard}, {@code TcgCardPokemon},
 * {@code TcgCardPrice}): la lectura de {@code PrismaTcgCardRepository.loadComparableCards} y la escritura de
 * {@code TcgDataSync}. SQL nativo por JDBC dentro de la transacción de Hibernate, como
 * {@link JpaPokemonCatalogStore}: los {@code upsert} de Prisma pasan a {@code INSERT … ON CONFLICT} con las mismas ramas
 * {@code create}/{@code update}, los {@code Json} a {@code jsonb}, {@code "updatedAt"} se escribe en cada inserción y
 * actualización y el {@code cuid()} del id de precio es un UUID (como {@code DataSyncRun}).
 *
 * <p>La lectura ordena por id en orden de puntos de código ({@code COLLATE "C"}; Node no ordena: el orden de las cartas
 * no es observable de forma determinista).
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaTcgCardRepository implements TcgCardRepository, TcgCatalogStore {

  private static final String COMPARABLE_CARDS = """
      SELECT c."id", c."localId", c."name", c."rarity", c."imageUrl", s."id", s."name",
        ARRAY(SELECT DISTINCT p."generation" FROM "TcgCardPokemon" cp JOIN "Pokemon" p ON p."id" = cp."pokemonId"
          WHERE cp."cardId" = c."id" ORDER BY 1)
      FROM "TcgCard" c JOIN "TcgSet" s ON s."id" = c."setId"
      WHERE c."imageUrl" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "TcgCardPrice" pr WHERE pr."cardId" = c."id" AND pr."market" IS NOT NULL)
      ORDER BY c."id" COLLATE "C"
      """;
  private static final String COMPARABLE_PRICES = """
      SELECT pr."cardId", pr."provider", pr."currency", pr."variant", pr."market", pr."observedAt"
      FROM "TcgCardPrice" pr JOIN "TcgCard" c ON c."id" = pr."cardId"
      WHERE pr."market" IS NOT NULL AND c."imageUrl" IS NOT NULL
      ORDER BY pr."cardId" COLLATE "C", pr."id" COLLATE "C"
      """;
  private static final String UPSERT_SET = """
      INSERT INTO "TcgSet" ("id", "name", "series", "logoUrl", "symbolUrl", "releaseDate", "cardCount", "metadata",
        "sourceUpdatedAt", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?)
      ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "series" = EXCLUDED."series",
        "logoUrl" = EXCLUDED."logoUrl", "symbolUrl" = EXCLUDED."symbolUrl", "releaseDate" = EXCLUDED."releaseDate",
        "cardCount" = EXCLUDED."cardCount", "metadata" = EXCLUDED."metadata",
        "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt", "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String UPSERT_CARD = """
      INSERT INTO "TcgCard" ("id", "localId", "setId", "name", "category", "hp", "rarity", "imageUrl", "illustrator",
        "metadata", "sourceUpdatedAt", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?)
      ON CONFLICT ("id") DO UPDATE SET "localId" = EXCLUDED."localId", "setId" = EXCLUDED."setId",
        "name" = EXCLUDED."name", "category" = EXCLUDED."category", "hp" = EXCLUDED."hp",
        "rarity" = EXCLUDED."rarity", "imageUrl" = EXCLUDED."imageUrl", "illustrator" = EXCLUDED."illustrator",
        "metadata" = EXCLUDED."metadata", "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt",
        "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String UPSERT_PRICE = """
      INSERT INTO "TcgCardPrice" ("id", "cardId", "provider", "currency", "variant", "market", "low", "mid", "high",
        "trend", "metadata", "observedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
      ON CONFLICT ("cardId", "provider", "currency", "variant") DO UPDATE SET "market" = EXCLUDED."market",
        "low" = EXCLUDED."low", "mid" = EXCLUDED."mid", "high" = EXCLUDED."high", "trend" = EXCLUDED."trend",
        "metadata" = EXCLUDED."metadata", "observedAt" = EXCLUDED."observedAt"
      """;
  private static final String DEFAULT_POKEMON = """
      SELECT "id" FROM "Pokemon" WHERE "nationalDexNumber" = ANY(?) AND "isDefault" ORDER BY "id" COLLATE "C"
      """;

  private final EntityManager entityManager;
  private final JsonMapper json;

  public JpaTcgCardRepository(EntityManager entityManager, JsonMapper json) {
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

  /** Nulo con tipo SQL explícito. */
  private record Null(int sqlType) {}

  private <T> T jdbc(SqlWork<T> work) {
    var session = entityManager instanceof Session current ? current : entityManager.unwrap(Session.class);
    return session.doReturningWork(work::run);
  }

  private static void bind(PreparedStatement statement, Object... params) throws SQLException {
    for (int i = 0; i < params.length; i++) {
      switch (params[i]) {
        case null -> statement.setNull(i + 1, Types.VARCHAR);
        case Null typed -> statement.setNull(i + 1, typed.sqlType());
        // Las columnas son timestamp(3) sin zona en UTC (Prisma); Timestamp.from usaría la zona de la JVM.
        case Instant instant -> statement.setObject(i + 1, LocalDateTime.ofInstant(instant, ZoneOffset.UTC));
        default -> statement.setObject(i + 1, params[i]);
      }
    }
  }

  private <T> List<T> query(String sql, RowMapper<T> mapper, Object... params) {
    return jdbc(connection -> {
      try (var statement = connection.prepareStatement(sql)) {
        bind(statement, params);
        try (var rows = statement.executeQuery()) {
          var result = new ArrayList<T>();
          while (rows.next()) result.add(mapper.map(rows));
          return result;
        }
      }
    });
  }

  private int update(String sql, Object... params) {
    return jdbc(connection -> {
      try (var statement = connection.prepareStatement(sql)) {
        bind(statement, params);
        return statement.executeUpdate();
      }
    });
  }

  private static Object text(@Nullable String value) {
    return value == null ? new Null(Types.VARCHAR) : value;
  }

  private static Object integer(@Nullable Integer value) {
    return value == null ? new Null(Types.INTEGER) : value;
  }

  private static Object decimal(@Nullable BigDecimal value) {
    return value == null ? new Null(Types.NUMERIC) : value;
  }

  private static Object timestamp(@Nullable Instant value) {
    return value == null ? new Null(Types.TIMESTAMP) : value;
  }

  private String write(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  // --- Lectura del catálogo ----------------------------------------------------------------------------------------

  /**
   * {@code market} como el {@code Decimal.toString()} de Prisma: sin ceros finales y sin notación exponencial (con
   * {@code numeric(12,4)} decimal.js nunca la usa).
   */
  static String market(BigDecimal value) {
    return value.stripTrailingZeros().toPlainString();
  }

  @Override
  @Transactional
  public List<TcgCardRepository.CardRow> loadComparableCards() {
    Map<String, List<TcgCardRepository.PriceRow>> prices = new HashMap<>();
    query(COMPARABLE_PRICES, row -> prices.computeIfAbsent(row.getString(1), id -> new ArrayList<>())
        .add(new TcgCardRepository.PriceRow(row.getString(2), row.getString(3), row.getString(4), market(row.getBigDecimal(5)),
            row.getObject(6, LocalDateTime.class).toInstant(ZoneOffset.UTC))));
    return query(COMPARABLE_CARDS, row -> {
      var generations = new ArrayList<Integer>();
      for (var value : (Object[]) row.getArray(8).getArray()) generations.add(((Number) value).intValue());
      var id = row.getString(1);
      return new TcgCardRepository.CardRow(id, row.getString(2), row.getString(3), row.getString(4), row.getString(5),
          row.getString(6), row.getString(7), List.copyOf(generations), List.copyOf(prices.getOrDefault(id, List.of())));
    });
  }

  // --- Escritura de la sincronización ------------------------------------------------------------------------------

  @Override
  @Transactional
  public List<String> cardIds() {
    return query("SELECT \"id\" FROM \"TcgCard\" ORDER BY \"id\" COLLATE \"C\"", row -> row.getString(1));
  }

  @Override
  @Transactional
  public long countCards() {
    return query("SELECT count(*) FROM \"TcgCard\"", row -> row.getLong(1)).getFirst();
  }

  @Override
  @Transactional
  public void upsertSet(TcgCatalogStore.SetRow set, Instant now) {
    update(UPSERT_SET, set.id(), set.name(), text(set.series()), text(set.logoUrl()), text(set.symbolUrl()),
        timestamp(set.releaseDate()), integer(set.cardCount()), write(set.metadata()), now, now, now);
  }

  @Override
  @Transactional
  public void upsertCard(TcgCatalogStore.CardRow card, Instant now) {
    update(UPSERT_CARD, card.id(), text(card.localId()), card.setId(), card.name(), text(card.category()),
        integer(card.hp()), text(card.rarity()), text(card.imageUrl()), text(card.illustrator()),
        write(card.metadata()), card.sourceUpdatedAt(), now, now);
  }

  @Override
  @Transactional
  public void replaceCardPokemon(String cardId, List<Integer> nationalDexNumbers) {
    var pokemonIds = nationalDexNumbers.isEmpty() ? List.<String>of() : jdbc(connection -> {
      try (var statement = connection.prepareStatement(DEFAULT_POKEMON)) {
        statement.setArray(1, connection.createArrayOf("integer", nationalDexNumbers.toArray()));
        try (var rows = statement.executeQuery()) {
          var ids = new ArrayList<String>();
          while (rows.next()) ids.add(rows.getString(1));
          return ids;
        }
      }
    });
    update("DELETE FROM \"TcgCardPokemon\" WHERE \"cardId\" = ?", cardId);
    jdbc(connection -> {
      try (var statement = connection.prepareStatement(
          "INSERT INTO \"TcgCardPokemon\" (\"cardId\", \"pokemonId\") VALUES (?, ?) ON CONFLICT DO NOTHING")) {
        for (var pokemonId : pokemonIds) {
          bind(statement, cardId, pokemonId);
          statement.addBatch();
        }
        if (!pokemonIds.isEmpty()) statement.executeBatch();
      }
      return null;
    });
  }

  @Override
  @Transactional
  public void upsertPrices(String cardId, List<TcgDexPayloads.PriceLeaf> prices, Instant now) {
    if (prices.isEmpty()) return;
    jdbc(connection -> {
      try (var statement = connection.prepareStatement(UPSERT_PRICE)) {
        for (var price : prices) {
          bind(statement, UUID.randomUUID().toString(), cardId, price.provider(), price.currency(), price.variant(),
              decimal(price.market()), decimal(price.low()), decimal(price.mid()), decimal(price.high()),
              decimal(price.trend()), write(price.metadata()), now);
          statement.addBatch();
        }
        statement.executeBatch();
      }
      return null;
    });
  }
}
