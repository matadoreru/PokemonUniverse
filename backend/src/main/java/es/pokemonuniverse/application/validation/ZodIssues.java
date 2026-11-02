package es.pokemonuniverse.application.validation;

import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Incidencias con la forma de Zod 4 (claves en el mismo orden). En el ack de las salas, el mensaje de un
 * {@code ZodError} es {@code JSON.stringify(issues, null, 2)} y Node lo devuelve tal cual ({@link #stringify()}); en
 * HTTP, el manejador global de Node responde {@code {error: <primer mensaje>, issues}} ({@link #list()}). Solo cubre
 * las incidencias que producen los esquemas portados.
 */
public final class ZodIssues {

  private final List<Map<String, Object>> issues = new ArrayList<>();

  public boolean isEmpty() {
    return issues.isEmpty();
  }

  public int size() {
    return issues.size();
  }

  /** {@code JSON.stringify(issues, null, 2)}. */
  public String stringify() {
    return stringify(issues);
  }

  /** Copia inmutable de las incidencias, en orden. */
  public List<Map<String, Object>> list() {
    return List.copyOf(issues);
  }

  /** Mensaje de la primera incidencia, como el {@code error} del manejador global de Node. */
  public String firstMessage() {
    return issues.isEmpty() ? "Invalid input" : (String) issues.getFirst().get("message");
  }

  public static String typeName(JsonNode node) {
    if (node == null) return "undefined";
    if (node.isNull()) return "null";
    if (node.isString()) return "string";
    if (node.isNumber()) return "number";
    if (node.isBoolean()) return "boolean";
    if (node.isArray()) return "array";
    return "object";
  }

  /** Objeto raíz que no es objeto: Zod pone {@code code} antes de {@code expected}. */
  public void rootNotObject(JsonNode node) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "invalid_type");
    issue.put("expected", "object");
    issue.put("path", List.of());
    issue.put("message", "Invalid input: expected object, received " + typeName(node));
    issues.add(issue);
  }

  public void invalidType(String expected, JsonNode node, List<Object> path) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("expected", expected);
    issue.put("code", "invalid_type");
    issue.put("path", path);
    issue.put("message", "Invalid input: expected " + expected + ", received " + typeName(node));
    issues.add(issue);
  }

  public void notInteger(List<Object> path) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("expected", "int");
    issue.put("format", "safeint");
    issue.put("code", "invalid_type");
    issue.put("path", path);
    issue.put("message", "Invalid input: expected int, received number");
    issues.add(issue);
  }

  public void tooSmall(String origin, long minimum, List<Object> path, String message) {
    bound("too_small", "minimum", origin, minimum, path, message);
  }

  public void tooBig(String origin, long maximum, List<Object> path, String message) {
    bound("too_big", "maximum", origin, maximum, path, message);
  }

  /** Entero fuera del rango seguro en {@code z.number().int()}: incidencia continuable con su {@code note}. */
  public void unsafeInteger(boolean tooBig, List<Object> path) {
    long limit = tooBig ? 9_007_199_254_740_991L : -9_007_199_254_740_991L;
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", tooBig ? "too_big" : "too_small");
    issue.put(tooBig ? "maximum" : "minimum", limit);
    issue.put("note", "Integers must be within the safe integer range.");
    issue.put("origin", "int");
    issue.put("inclusive", true);
    issue.put("path", path);
    issue.put("message", (tooBig ? "Too big: expected int to be <=" : "Too small: expected int to be >=") + limit);
    issues.add(issue);
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

  public void invalidFormat(String format, String pattern, List<Object> path, String message) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("origin", "string");
    issue.put("code", "invalid_format");
    issue.put("format", format);
    issue.put("pattern", pattern);
    issue.put("path", path);
    issue.put("message", message);
    issues.add(issue);
  }

  public void noDiscriminator(List<String> options) {
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

  public void custom(List<Object> path, String message) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "custom");
    issue.put("path", path);
    issue.put("message", message);
    issues.add(issue);
  }

  public void unrecognizedKeys(List<String> keys) {
    unrecognizedKeys(keys, List.of());
  }

  /** Claves desconocidas de un objeto anidado (p. ej. {@code ['prompts', 1]}). */
  public void unrecognizedKeys(List<String> keys, List<Object> path) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "unrecognized_keys");
    issue.put("keys", keys);
    issue.put("path", path);
    issue.put("message", (keys.size() == 1 ? "Unrecognized key: " : "Unrecognized keys: ")
        + String.join(", ", keys.stream().map(JsonTree::quote).toList()));
    issues.add(issue);
  }

  public void invalidValue(List<String> values) {
    invalidValue(values, List.of());
  }

  /** {@code z.enum(values)} no satisfecho en {@code path}. */
  public void invalidValue(List<String> values, List<Object> path) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "invalid_value");
    issue.put("values", values);
    issue.put("path", path);
    issue.put("message", "Invalid option: expected one of "
        + String.join("|", values.stream().map(JsonTree::quote).toList()));
    issues.add(issue);
  }

  /** {@code z.literal(value)} no satisfecho: {@code values} lleva el valor sin comillas si es un número. */
  public void invalidLiteral(Object value, List<Object> path) {
    var issue = new LinkedHashMap<String, Object>();
    issue.put("code", "invalid_value");
    issue.put("values", List.of(value));
    issue.put("path", path);
    issue.put("message", "Invalid input: expected " + stringify(value));
    issues.add(issue);
  }

  /** {@code JSON.stringify(value, null, 2)} para cadenas, números, booleanos, listas y mapas. */
  public static String stringify(Object value) {
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
