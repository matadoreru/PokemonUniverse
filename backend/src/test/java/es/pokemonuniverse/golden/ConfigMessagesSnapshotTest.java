package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import io.micronaut.core.type.Argument;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * Instantánea de los mensajes de {@code parseConfig}: la configuración por defecto de cada motor con cada clave (y cada
 * clave de los objetos anidados) ausente o sustituida por unas pocas sondas. Fija el texto que la sala muestra como
 * motivo de no disponibilidad, que las fixtures doradas no comparan. Se regenera con
 * {@code ./gradlew test -Dupdate=true --tests '*ConfigMessagesSnapshotTest*'}.
 */
class ConfigMessagesSnapshotTest {

  private static final Path SNAPSHOT = Path.of("src/test/resources/config-messages.json");
  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();
  private static final boolean UPDATE = Boolean.getBoolean("update");

  /** Un test por motor con fixtures doradas (los 31 registrados). */
  @TestFactory
  Stream<DynamicTest> messagesMatchTheSnapshot() throws IOException, URISyntaxException {
    List<String> ids;
    try (var dirs = Files.list(Path.of(getClass().getResource("/golden").toURI()))) {
      ids = dirs.filter(Files::isDirectory).map(dir -> dir.getFileName().toString())
          .filter(id -> !id.equals("catalog")).sorted().toList();
    }
    return ids.stream().map(id -> dynamicTest(id, () -> check(id)));
  }

  private static void check(String engineId) throws IOException {
    var engine = GoldenEngines.get(engineId).orElseThrow();
    var actual = messages(engine);
    var snapshot = read();
    if (UPDATE) {
      snapshot.put(engineId, actual);
      write(snapshot);
      return;
    }
    assertEquals(snapshot.get(engineId), actual, engineId + ": regenera con -Dupdate=true si el cambio es intencionado");
  }

  private static Map<String, String> messages(GameEngine<?, ?, ?, ?> engine) {
    var out = new LinkedHashMap<String, String>();
    out.put("<raíz null>", outcome(engine, JsonNode.nullNode()));
    out.put("<raíz lista>", outcome(engine, JsonNode.createArrayNode(List.of())));
    var defaults = GoldenReplayer.tree(engine.defaultConfig());
    var unknown = entries(defaults);
    unknown.put("zzUnknown", JsonNode.createNumberNode(1));
    out.put("<clave desconocida>", outcome(engine, JsonNode.createObjectNode(unknown)));
    probe(engine, defaults, "", UnaryOperator.identity(), out);
    return out;
  }

  private static void probe(GameEngine<?, ?, ?, ?> engine, JsonNode object, String prefix,
      UnaryOperator<JsonNode> wrap, Map<String, String> out) {
    for (var entry : object.entries()) {
      var key = entry.getKey();
      var value = entry.getValue();
      var name = prefix + key;
      UnaryOperator<JsonNode> with = replacement -> {
        var copy = entries(object);
        if (replacement == null) copy.remove(key); else copy.put(key, replacement);
        return wrap.apply(JsonNode.createObjectNode(copy));
      };
      out.put(name + " ausente", outcome(engine, with.apply(null)));
      out.put(name + " tipo erróneo",
          outcome(engine, with.apply(value.isString() ? JsonNode.createNumberNode(1) : JsonNode.createStringNode("x"))));
      if (value.isNumber() || value.isArray()) {
        for (var number : List.of(10.5, 1e20, -1.0)) {
          var numberNode = JsonNode.createNumberNode(number);
          var probe = value.isArray() ? JsonNode.createArrayNode(List.of(numberNode)) : numberNode;
          var label = number == 1e20 ? "1e20" : number == -1.0 ? "-1" : "10.5";
          out.put(name + (value.isArray() ? " [" + label + "]" : " " + label), outcome(engine, with.apply(probe)));
        }
      }
      if (value.isObject()) probe(engine, value, name + ".", with::apply, out);
    }
  }

  private static String outcome(GameEngine<?, ?, ?, ?> engine, JsonNode input) {
    try {
      engine.parseConfig(input);
      return "valid";
    } catch (ConfigValidationException e) {
      return e.getMessage();
    }
  }

  private static LinkedHashMap<String, JsonNode> entries(JsonNode object) {
    var map = new LinkedHashMap<String, JsonNode>();
    for (var entry : object.entries()) map.put(entry.getKey(), entry.getValue());
    return map;
  }

  private static Map<String, Map<String, String>> read() throws IOException {
    if (!Files.exists(SNAPSHOT)) return new TreeMap<>();
    Map<String, Map<String, String>> parsed = MAPPER.readValue(Files.readString(SNAPSHOT),
        Argument.mapOf(Argument.STRING, Argument.mapOf(String.class, String.class)));
    return new TreeMap<>(parsed);
  }

  /** JSON con un mensaje por línea, para que un cambio se lea en el diff. */
  private static void write(Map<String, Map<String, String>> snapshot) throws IOException {
    var json = new StringBuilder("{\n");
    int engines = 0;
    for (var engine : snapshot.entrySet()) {
      json.append("  ").append(MAPPER.writeValueAsString(engine.getKey())).append(": {\n");
      int lines = 0;
      for (var line : engine.getValue().entrySet()) {
        json.append("    ").append(MAPPER.writeValueAsString(line.getKey())).append(": ")
            .append(MAPPER.writeValueAsString(line.getValue()))
            .append(++lines < engine.getValue().size() ? ",\n" : "\n");
      }
      json.append("  }").append(++engines < snapshot.size() ? ",\n" : "\n");
    }
    Files.writeString(SNAPSHOT, json.append("}\n").toString());
  }
}
