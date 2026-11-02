package es.pokemonuniverse.application.datasync.pokemon;

import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Volcado de las tablas del catálogo con el mismo SQL que el generador Node ({@code dump-tables.json}) y limpieza
 * entre pruebas (otras pruebas comparten la BD de Testcontainers).
 */
public final class CatalogTables {

  static final JsonNode SPEC = ExtractorsTest.read("/datasync/pokeapi/dump-tables.json");
  private static final ObjectMapper JSON = ObjectMapper.getDefault();

  private CatalogTables() {}

  static List<String> names() {
    var names = new ArrayList<String>();
    SPEC.get("tables").values().forEach(table -> names.add(table.get("table").getStringValue()));
    return names;
  }

  /** Vacía las 15 tablas del catálogo (y lo que dependa de ellas) en la BD de pruebas. */
  public static void clear(Connection connection) throws SQLException {
    var quoted = names().stream().map(name -> "\"" + name + "\"").toList();
    try (var statement = connection.createStatement()) {
      statement.execute("TRUNCATE " + String.join(", ", quoted) + " CASCADE");
    }
  }

  /** {@code {tabla: [filas]}} como objetos Java planos (números en {@code double}) para comparar por valor. */
  static Map<String, Object> dump(Connection connection) throws SQLException, IOException {
    var minus = new StringBuilder();
    SPEC.get("excludedColumns").values()
        .forEach(column -> minus.append(" - '").append(column.getStringValue()).append("'"));
    Map<String, Object> result = new LinkedHashMap<>();
    for (var table : SPEC.get("tables").values()) {
      var name = table.get("table").getStringValue();
      var rows = new ArrayList<Object>();
      var sql = "SELECT CAST(to_jsonb(t)" + minus + " AS text) FROM \"" + name + "\" t ORDER BY "
          + table.get("orderBy").getStringValue();
      try (var statement = connection.createStatement(); var set = statement.executeQuery(sql)) {
        while (set.next()) rows.add(plain(JSON.readValue(set.getString(1), JsonNode.class)));
      }
      result.put(name, rows);
    }
    return result;
  }

  static Map<String, Object> expected(JsonNode tables) {
    Map<String, Object> result = new LinkedHashMap<>();
    tables.entries().forEach(entry -> result.put(entry.getKey(), plain(entry.getValue())));
    return result;
  }

  /**
   * Objeto Java plano para comparar por valor. Los números no enteros se redondean a 15 cifras significativas: Prisma
   * persiste los {@code float} de un {@code Json} con ~16 cifras ({@code 0.14191852825229961} se guarda como
   * {@code 0.1419185282522996}), mientras que Java guarda la representación exacta más corta del {@code double}; los
   * valores calculados son idénticos ({@code PaletteExtractorTest} los compara sin redondeo).
   */
  static Object plain(JsonNode node) {
    if (node.isNull()) return null;
    if (node.isString()) return node.getStringValue();
    if (node.isBoolean()) return node.getBooleanValue();
    if (node.isNumber()) {
      double value = node.getNumberValue().doubleValue();
      if (value == Math.rint(value)) return value;
      return new BigDecimal(Double.toString(value)).round(new MathContext(15, RoundingMode.HALF_EVEN)).doubleValue();
    }
    if (node.isArray()) {
      var list = new ArrayList<Object>();
      node.values().forEach(value -> list.add(plain(value)));
      return list;
    }
    Map<String, Object> map = new LinkedHashMap<>();
    node.entries().forEach(entry -> map.put(entry.getKey(), plain(entry.getValue())));
    return map;
  }
}
