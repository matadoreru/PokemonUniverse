package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Comparación de árboles JSON para el arnés dorado (constraint 13 de la etapa 2B): como
 * {@link JsonTree#firstDifference} pero sensible al orden de las claves. Ningún lado se canonicaliza: el orden que
 * grabó TypeScript (claves con aspecto de entero ascendentes y el resto por inserción) es el que debe producir la
 * serialización de Java. Los números se comparan por valor ({@code 1 == 1.0}) y una clave ausente es distinta de un
 * {@code null} presente. {@link JsonTree#equal} de producción sigue ignorando el orden.
 */
public final class OrderedJsonCompare {

  private OrderedJsonCompare() {}

  /** Primera diferencia como {@code ruta: esperado X, obtenido Y} o {@code ruta: orden de claves …}; vacío si coinciden. */
  public static Optional<String> firstDifference(String path, JsonNode expected, JsonNode actual) {
    return Optional.ofNullable(diff(path, expected, actual));
  }

  private static String diff(String path, JsonNode expected, JsonNode actual) {
    if (expected != null && actual != null && expected.isObject() && actual.isObject()) return diffObjects(path, expected, actual);
    if (expected != null && actual != null && expected.isArray() && actual.isArray()) return diffArrays(path, expected, actual);
    return JsonTree.equal(expected, actual) ? null : report(path, expected, actual);
  }

  /** Primero valores y presencia clave a clave; si todo coincide salvo la secuencia, el orden de claves. */
  private static String diffObjects(String path, JsonNode expected, JsonNode actual) {
    for (Map.Entry<String, JsonNode> entry : expected.entries()) {
      var other = actual.get(entry.getKey());
      var childPath = child(path, entry.getKey());
      var found = other == null ? report(childPath, entry.getValue(), null) : diff(childPath, entry.getValue(), other);
      if (found != null) return found;
    }
    for (Map.Entry<String, JsonNode> entry : actual.entries()) {
      if (expected.get(entry.getKey()) == null) return report(child(path, entry.getKey()), null, entry.getValue());
    }
    var expectedKeys = keys(expected);
    var actualKeys = keys(actual);
    if (expectedKeys.equals(actualKeys)) return null;
    return (path.isEmpty() ? "<raíz>" : path) + ": orden de claves esperado [" + String.join(",", expectedKeys)
        + "] obtenido [" + String.join(",", actualKeys) + "]";
  }

  private static String diffArrays(String path, JsonNode expected, JsonNode actual) {
    int common = Math.min(expected.size(), actual.size());
    for (int i = 0; i < common; i++) {
      var found = diff(path + "[" + i + "]", expected.get(i), actual.get(i));
      if (found != null) return found;
    }
    if (expected.size() == actual.size()) return null;
    return report(path + "[" + common + "]", common < expected.size() ? expected.get(common) : null,
        common < actual.size() ? actual.get(common) : null);
  }

  private static List<String> keys(JsonNode node) {
    var keys = new ArrayList<String>(node.size());
    for (Map.Entry<String, JsonNode> entry : node.entries()) keys.add(entry.getKey());
    return keys;
  }

  private static String child(String path, String key) {
    return path.isEmpty() ? key : path + "." + key;
  }

  private static String report(String path, JsonNode expected, JsonNode actual) {
    return path + ": esperado " + show(expected) + ", obtenido " + show(actual);
  }

  /** {@code null} de Java = ausente; los nulos JSON son {@code JsonNode.nullNode()}. */
  private static String show(JsonNode node) {
    return node == null ? "<ausente>" : JsonTree.toCanonicalString(node);
  }
}
