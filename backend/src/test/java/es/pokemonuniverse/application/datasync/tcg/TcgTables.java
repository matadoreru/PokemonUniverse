package es.pokemonuniverse.application.datasync.tcg;

import es.pokemonuniverse.application.tcg.TcgCardRepository;
import es.pokemonuniverse.application.tcg.TcgFixtures;
import io.micronaut.json.tree.JsonNode;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Las 4 tablas TCG con el mismo SQL que el generador Node ({@code dump-tables.json}), los Pokémon de
 * {@code tcg/pokemon-rows.json} y la limpieza entre pruebas (la BD de Testcontainers es compartida).
 */
public final class TcgTables {

  static final JsonNode SPEC = TcgFixtures.read("/datasync/tcgdex/dump-tables.json");
  static final JsonNode POKEMON = TcgFixtures.read("/tcg/pokemon-rows.json");

  private TcgTables() {}

  public static void clear(Connection connection) throws SQLException {
    try (var statement = connection.createStatement()) {
      statement.execute("TRUNCATE \"TcgCardPrice\", \"TcgCardPokemon\", \"TcgCard\", \"TcgSet\" CASCADE");
    }
  }

  /** Los Pokémon por defecto (y una forma) con los {@code dexId} de las fixtures. */
  public static void insertPokemon(Connection connection) throws SQLException {
    deletePokemon(connection);
    try (var statement = connection.prepareStatement("INSERT INTO \"Pokemon\" (\"id\", \"nationalDexNumber\", \"name\","
        + " \"generation\", \"isDefault\", \"sprite\", \"abilities\", \"types\", \"updatedAt\")"
        + " VALUES (?, ?, ?, ?, ?, 'https://img.test/x.png', '{}', '{}', ?)")) {
      for (var row : POKEMON.values()) {
        statement.setString(1, row.get("id").getStringValue());
        statement.setInt(2, row.get("nationalDexNumber").getIntValue());
        statement.setString(3, row.get("id").getStringValue());
        statement.setInt(4, row.get("generation").getIntValue());
        statement.setBoolean(5, row.get("isDefault").getBooleanValue());
        statement.setTimestamp(6, Timestamp.from(Instant.now()));
        statement.addBatch();
      }
      statement.executeBatch();
    }
  }

  public static void deletePokemon(Connection connection) throws SQLException {
    var ids = new ArrayList<String>();
    POKEMON.values().forEach(row -> ids.add(row.get("id").getStringValue()));
    try (var statement = connection.prepareStatement("DELETE FROM \"Pokemon\" WHERE \"id\" = ANY(?)")) {
      statement.setArray(1, connection.createArrayOf("text", ids.toArray()));
      statement.executeUpdate();
    }
  }

  /**
   * Catálogo mínimo para rutas y salas: el set {@code base1} con Charizard (2), Blastoise (3.5) y Pikachu (1.10),
   * rareza {@code Rare}, imagen https y precio EUR de Cardmarket {@code standard}; vinculados a los Pokémon de
   * {@link #insertPokemon}.
   */
  public static void seedCatalog(Connection connection) throws SQLException {
    insertPokemon(connection);
    try (var statement = connection.createStatement()) {
      statement.execute("INSERT INTO \"TcgSet\" (\"id\", \"name\", \"updatedAt\") VALUES ('base1', 'Base Set', now())");
      statement.execute("INSERT INTO \"TcgCard\" (\"id\", \"localId\", \"setId\", \"name\", \"rarity\", \"imageUrl\","
          + " \"updatedAt\") VALUES"
          + " ('base1-4', '4', 'base1', 'Charizard', 'Rare', 'https://img.test/base1-4.webp', now()),"
          + " ('base1-2', '2', 'base1', 'Blastoise', 'Rare', 'https://img.test/base1-2.webp', now()),"
          + " ('base1-58', '58', 'base1', 'Pikachu', 'Rare', 'https://img.test/base1-58.webp', now())");
      statement.execute("INSERT INTO \"TcgCardPokemon\" (\"cardId\", \"pokemonId\") VALUES ('base1-4', 'charizard'),"
          + " ('base1-2', 'blastoise'), ('base1-58', 'pikachu')");
      statement.execute("INSERT INTO \"TcgCardPrice\" (\"id\", \"cardId\", \"provider\", \"currency\", \"variant\","
          + " \"market\") VALUES ('p1', 'base1-4', 'cardmarket', 'EUR', 'standard', 2),"
          + " ('p2', 'base1-2', 'cardmarket', 'EUR', 'standard', 3.5),"
          + " ('p3', 'base1-58', 'cardmarket', 'EUR', 'standard', 1.10)");
    }
  }

  static Instant sourceUpdatedAt(Connection connection, String cardId) throws SQLException {
    try (var statement = connection.prepareStatement("SELECT \"sourceUpdatedAt\" FROM \"TcgCard\" WHERE \"id\" = ?")) {
      statement.setString(1, cardId);
      try (var rows = statement.executeQuery()) {
        rows.next();
        return rows.getObject(1, java.time.LocalDateTime.class).toInstant(java.time.ZoneOffset.UTC);
      }
    }
  }

  /** {@code {tabla: [filas]}} como objetos planos. */
  public static Map<String, Object> dump(Connection connection) throws Exception {
    Map<String, Object> result = new LinkedHashMap<>();
    for (var table : SPEC.get("tables").values()) {
      var name = table.get("table").getStringValue();
      var minus = new StringBuilder();
      table.get("exclude").values().forEach(column -> minus.append(" - '").append(column.getStringValue()).append("'"));
      var rows = new ArrayList<Object>();
      var sql = "SELECT CAST(to_jsonb(t)" + minus + " AS text) FROM \"" + name + "\" t ORDER BY "
          + table.get("orderBy").getStringValue();
      try (var statement = connection.createStatement(); var set = statement.executeQuery(sql)) {
        while (set.next()) rows.add(TcgFixtures.plain(TcgFixtures.JSON.readValue(set.getString(1), JsonNode.class)));
      }
      result.put(name, rows);
    }
    return result;
  }

  public static Map<String, Object> expected(JsonNode tables) {
    Map<String, Object> result = new LinkedHashMap<>();
    tables.entries().forEach(entry -> result.put(entry.getKey(), TcgFixtures.plain(entry.getValue())));
    return result;
  }

  /** La forma de una fila del repositorio de Node en {@code expected-sync.json} (precios ordenados, sin fecha). */
  static Map<String, Object> nodeShape(TcgCardRepository.CardRow row) {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", row.id());
    value.put("localId", row.localId());
    value.put("name", row.name());
    value.put("rarity", row.rarity());
    value.put("imageUrl", row.imageUrl());
    value.put("set", Map.of("id", row.setId(), "name", row.setName()));
    var prices = new ArrayList<>(row.prices());
    prices.sort(Comparator.comparing((TcgCardRepository.PriceRow price) -> price.provider() + "\0" + price.currency()
        + "\0" + price.variant()));
    var plain = new ArrayList<Object>();
    for (var price : prices) {
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("provider", price.provider());
      entry.put("currency", price.currency());
      entry.put("variant", price.variant());
      entry.put("market", price.market());
      plain.add(entry);
    }
    value.put("prices", plain);
    value.put("pokemonGenerations", row.pokemonGenerations().stream().sorted().toList());
    return value;
  }
}
