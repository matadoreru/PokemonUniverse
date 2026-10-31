package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Incidencias con la forma de Zod 4: el mensaje de un {@code ZodError} es {@code JSON.stringify(issues, null, 2)} y
 * Node lo devuelve tal cual en el ack. Solo cubre las incidencias que producen los esquemas de {@code room.ts}.
 */
final class ZodIssues {

  private final List<Map<String, Object>> issues = new ArrayList<>();

  boolean isEmpty() {
    return issues.isEmpty();
  }

  int size() {
    return issues.size();
  }

  RoomException toException() {
    return new RoomException(stringify(issues));
  }

  static String typeName(JsonNode node) {
    if (node == null) return "undefined";
    if (node.isNull()) return "null";
    if (node.isString()) return "string";
    if (node.isNumber()) return "number";
    if (node.isBoolean()) return "boolean";
    if (node.isArray()) return "array";
    return "object";
  }

  /** Objeto raíz que no es objeto: Zod pone {@code code} antes de {@code expected}. */
  void rootNotObject(JsonNode node) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "invalid_type");
    issue.put("expected", "object");
    issue.put("path", List.of());
    issue.put("message", "Invalid input: expected object, received " + typeName(node));
    issues.add(issue);
  }

  void invalidType(String expected, JsonNode node, List<Object> path) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("expected", expected);
    issue.put("code", "invalid_type");
    issue.put("path", path);
    issue.put("message", "Invalid input: expected " + expected + ", received " + typeName(node));
    issues.add(issue);
  }

  void notInteger(List<Object> path) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("expected", "int");
    issue.put("format", "safeint");
    issue.put("code", "invalid_type");
    issue.put("path", path);
    issue.put("message", "Invalid input: expected int, received number");
    issues.add(issue);
  }

  void tooSmall(String origin, long minimum, List<Object> path, String message) {
    bound("too_small", "minimum", origin, minimum, path, message);
  }

  void tooBig(String origin, long maximum, List<Object> path, String message) {
    bound("too_big", "maximum", origin, maximum, path, message);
  }

  private void bound(String code, String key, String origin, long value, List<Object> path, String message) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("origin", origin);
    issue.put("code", code);
    issue.put(key, value);
    issue.put("inclusive", true);
    issue.put("path", path);
    issue.put("message", message);
    issues.add(issue);
  }

  void invalidFormat(String format, String pattern, List<Object> path, String message) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("origin", "string");
    issue.put("code", "invalid_format");
    issue.put("format", format);
    issue.put("pattern", pattern);
    issue.put("path", path);
    issue.put("message", message);
    issues.add(issue);
  }

  void noDiscriminator(List<String> options) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "invalid_union");
    issue.put("errors", List.of());
    issue.put("note", "No matching discriminator");
    issue.put("discriminator", "type");
    issue.put("options", options);
    issue.put("path", List.of("type"));
    issue.put("message", "Invalid discriminator value. Expected "
        + String.join(" | ", options.stream().map(option -> "'" + option + "'").toList()));
    issues.add(issue);
  }

  void custom(List<Object> path, String message) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "custom");
    issue.put("path", path);
    issue.put("message", message);
    issues.add(issue);
  }

  void unrecognizedKeys(List<String> keys) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "unrecognized_keys");
    issue.put("keys", keys);
    issue.put("path", List.of());
    issue.put("message", (keys.size() == 1 ? "Unrecognized key: " : "Unrecognized keys: ")
        + String.join(", ", keys.stream().map(JsonTree::quote).toList()));
    issues.add(issue);
  }

  void invalidValue(List<String> values) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "invalid_value");
    issue.put("values", values);
    issue.put("path", List.of());
    issue.put("message", "Invalid option: expected one of "
        + String.join("|", values.stream().map(JsonTree::quote).toList()));
    issues.add(issue);
  }

  /** {@code JSON.stringify(value, null, 2)} para cadenas, números, booleanos, listas y mapas. */
  static String stringify(Object value) {
    var out = new StringBuilder();
    write(value, out, "");
    return out.toString();
  }

  private static void write(Object value, StringBuilder out, String indent) {
    switch (value) {
      case String text -> out.append(JsonTree.quote(text));
      case Number number -> out.append(JsNumbers.format(number));
      case Boolean bool -> out.append(bool);
      case List<?> list -> {
        if (list.isEmpty()) {
          out.append("[]");
          return;
        }
        var inner = indent + "  ";
        out.append("[\n");
        for (int i = 0; i < list.size(); i++) {
          out.append(inner);
          write(list.get(i), out, inner);
          out.append(i + 1 < list.size() ? ",\n" : "\n");
        }
        out.append(indent).append(']');
      }
      case Map<?, ?> map -> {
        if (map.isEmpty()) {
          out.append("{}");
          return;
        }
        var inner = indent + "  ";
        out.append("{\n");
        int i = 0;
        for (var entry : map.entrySet()) {
          out.append(inner).append(JsonTree.quote(entry.getKey().toString())).append(": ");
          write(entry.getValue(), out, inner);
          out.append(++i < map.size() ? ",\n" : "\n");
        }
        out.append(indent).append('}');
      }
      default -> throw new IllegalArgumentException("Tipo no serializable: " + value);
    }
  }
}
