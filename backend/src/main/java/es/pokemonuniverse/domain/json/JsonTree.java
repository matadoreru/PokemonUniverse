package es.pokemonuniverse.domain.json;

import io.micronaut.json.tree.JsonNode;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Utilidades sobre árboles {@link JsonNode} con la semántica de JavaScript: orden de propiedades de JS, igualdad
 * numérica entre {@code 1} y {@code 1.0} y serialización como {@code JSON.stringify}.
 */
public final class JsonTree {

  private static final Pattern ARRAY_INDEX = Pattern.compile("0|[1-9][0-9]{0,9}");
  private static final long MAX_ARRAY_INDEX_EXCLUSIVE = 4_294_967_295L;

  private JsonTree() {}

  /**
   * Copia con el orden de propiedades de un objeto JS, recursivamente: primero las claves con forma de índice de array
   * (decimal canónico menor que 2^32-1) en orden numérico ascendente y después el resto en orden de inserción.
   */
  public static JsonNode canonical(JsonNode node) {
    if (node == null) return JsonNode.nullNode();
    if (node.isArray()) {
      var items = new ArrayList<JsonNode>(node.size());
      for (var item : node.values()) items.add(canonical(item));
      return JsonNode.createArrayNode(items);
    }
    if (!node.isObject()) return node;
    var indexKeys = new ArrayList<String>();
    var otherKeys = new ArrayList<String>();
    var values = new LinkedHashMap<String, JsonNode>();
    for (Map.Entry<String, JsonNode> entry : node.entries()) {
      (isArrayIndex(entry.getKey()) ? indexKeys : otherKeys).add(entry.getKey());
      values.put(entry.getKey(), entry.getValue());
    }
    indexKeys.sort((a, b) -> Long.compare(Long.parseLong(a), Long.parseLong(b)));
    var ordered = new LinkedHashMap<String, JsonNode>();
    for (var key : indexKeys) ordered.put(key, canonical(values.get(key)));
    for (var key : otherKeys) ordered.put(key, canonical(values.get(key)));
    return JsonNode.createObjectNode(ordered);
  }

  /**
   * Igualdad estructural (como {@code isDeepStrictEqual} sobre JSON): el orden de las claves no importa, su presencia
   * sí; los números se comparan por valor ({@code 1 == 1.0}). Un {@code null} de Java equivale a JSON {@code null}.
   */
  public static boolean equal(JsonNode a, JsonNode b) {
    boolean aNull = a == null || a.isNull();
    boolean bNull = b == null || b.isNull();
    if (aNull || bNull) return aNull && bNull;
    if (a.isNumber() && b.isNumber()) return numbersEqual(a.getNumberValue(), b.getNumberValue());
    if (a.isString() && b.isString()) return a.getStringValue().equals(b.getStringValue());
    if (a.isBoolean() && b.isBoolean()) return a.getBooleanValue() == b.getBooleanValue();
    if (a.isArray() && b.isArray()) {
      if (a.size() != b.size()) return false;
      for (int i = 0; i < a.size(); i++) {
        if (!equal(a.get(i), b.get(i))) return false;
      }
      return true;
    }
    if (a.isObject() && b.isObject()) {
      if (a.size() != b.size()) return false;
      for (Map.Entry<String, JsonNode> entry : a.entries()) {
        var other = b.get(entry.getKey());
        if (other == null || !equal(entry.getValue(), other)) return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Primera diferencia entre dos árboles según {@link #equal}, como {@code ruta: esperado X, obtenido Y}; vacío si son
   * iguales. {@code basePath} prefija la ruta ({@code a.b[2].c}); una clave o posición que falta se muestra como
   * {@code <ausente>}, distinta de un {@code null} presente.
   */
  public static Optional<String> firstDifference(String basePath, JsonNode expected, JsonNode actual) {
    return Optional.ofNullable(diff(basePath, expected, actual));
  }

  private static String diff(String path, JsonNode expected, JsonNode actual) {
    if (equal(expected, actual)) return null;
    if (expected != null && actual != null && expected.isObject() && actual.isObject()) {
      for (Map.Entry<String, JsonNode> entry : expected.entries()) {
        var childPath = path.isEmpty() ? entry.getKey() : path + "." + entry.getKey();
        var other = actual.get(entry.getKey());
        var found = other == null ? report(childPath, entry.getValue(), null) : diff(childPath, entry.getValue(), other);
        if (found != null) return found;
      }
      for (Map.Entry<String, JsonNode> entry : actual.entries()) {
        if (expected.get(entry.getKey()) == null) {
          return report(path.isEmpty() ? entry.getKey() : path + "." + entry.getKey(), null, entry.getValue());
        }
      }
    }
    if (expected != null && actual != null && expected.isArray() && actual.isArray()) {
      int common = Math.min(expected.size(), actual.size());
      for (int i = 0; i < common; i++) {
        var found = diff(path + "[" + i + "]", expected.get(i), actual.get(i));
        if (found != null) return found;
      }
      return report(path + "[" + common + "]", common < expected.size() ? expected.get(common) : null,
          common < actual.size() ? actual.get(common) : null);
    }
    return report(path, expected, actual);
  }

  private static String report(String path, JsonNode expected, JsonNode actual) {
    return path + ": esperado " + show(expected) + ", obtenido " + show(actual);
  }

  /** {@code null} de Java = ausente (los nodos JSON {@code null} son {@code JsonNode.nullNode()}). */
  private static String show(JsonNode node) {
    return node == null ? "<ausente>" : toCanonicalString(node);
  }

  /** {@code JSON.stringify} compacto de {@link #canonical(JsonNode)}; para diagnósticos. */
  public static String toCanonicalString(JsonNode node) {
    var out = new StringBuilder();
    write(canonical(node), out);
    return out.toString();
  }

  /** Cadena entre comillas escapada como {@code JSON.stringify} (incluidos los sustitutos UTF-16 sueltos). */
  public static String quote(String value) {
    var out = new StringBuilder(value.length() + 2).append('"');
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\b' -> out.append("\\b");
        case '\f' -> out.append("\\f");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          boolean loneSurrogate = Character.isHighSurrogate(c)
              ? i + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(i + 1))
              : Character.isLowSurrogate(c) && (i == 0 || !Character.isHighSurrogate(value.charAt(i - 1)));
          if (c < 0x20 || loneSurrogate) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    return out.append('"').toString();
  }

  static boolean isArrayIndex(String key) {
    return ARRAY_INDEX.matcher(key).matches() && Long.parseLong(key) < MAX_ARRAY_INDEX_EXCLUSIVE;
  }

  private static boolean numbersEqual(Number a, Number b) {
    var exactA = exactInteger(a);
    var exactB = exactInteger(b);
    if (exactA != null && exactB != null) return exactA.compareTo(exactB) == 0;
    return a.doubleValue() == b.doubleValue();
  }

  /** Valor exacto si el número es entero; {@code null} si tiene parte fraccionaria o no es finito. */
  private static BigDecimal exactInteger(Number n) {
    if (n instanceof Integer || n instanceof Long || n instanceof Short || n instanceof Byte) {
      return BigDecimal.valueOf(n.longValue());
    }
    if (n instanceof BigInteger big) return new BigDecimal(big);
    if (n instanceof BigDecimal decimal) {
      return decimal.signum() == 0 || decimal.stripTrailingZeros().scale() <= 0 ? decimal : null;
    }
    double d = n.doubleValue();
    return Double.isFinite(d) && d == Math.rint(d) ? new BigDecimal(d) : null;
  }

  private static void write(JsonNode node, StringBuilder out) {
    if (node == null || node.isNull()) {
      out.append("null");
    } else if (node.isNumber()) {
      out.append(JsNumbers.format(node.getNumberValue()));
    } else if (node.isString()) {
      out.append(quote(node.getStringValue()));
    } else if (node.isBoolean()) {
      out.append(node.getBooleanValue());
    } else if (node.isArray()) {
      out.append('[');
      List<JsonNode> items = new ArrayList<>();
      node.values().forEach(items::add);
      for (int i = 0; i < items.size(); i++) {
        if (i > 0) out.append(',');
        write(items.get(i), out);
      }
      out.append(']');
    } else {
      out.append('{');
      boolean first = true;
      for (Map.Entry<String, JsonNode> entry : node.entries()) {
        if (!first) out.append(',');
        first = false;
        out.append(quote(entry.getKey())).append(':');
        write(entry.getValue(), out);
      }
      out.append('}');
    }
  }
}
