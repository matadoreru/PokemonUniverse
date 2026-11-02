package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigIssue;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

class ConfigReaderTest {

  private enum Mode { REALTIME, REVEAL }

  private static JsonNode object(Map<String, JsonNode> entries) {
    return JsonNode.createObjectNode(new LinkedHashMap<>(entries));
  }

  private static ConfigReader reader(String key, JsonNode value) {
    return ConfigReader.of(object(Map.of(key, value)), "Prueba");
  }

  private static JsonNode number(double value) {
    return JsonNode.createNumberNode(value);
  }

  private static void rejects(String detail, Runnable parse) {
    var error = assertThrows(ConfigValidationException.class, parse::run);
    assertEquals("Configuración de Prueba no válida: " + detail + ".", error.getMessage());
  }

  private static void rejectsWith(String key, JsonNode value, String detail, Consumer<ConfigReader> read) {
    rejects(detail, () -> read.accept(reader(key, value)));
  }

  @Test
  void rootMustBeAnObject() {
    rejects("la configuración debe ser un objeto", () -> ConfigReader.of(null, "Prueba"));
    rejects("la configuración debe ser un objeto", () -> ConfigReader.of(JsonNode.nullNode(), "Prueba"));
    rejects("la configuración debe ser un objeto", () -> ConfigReader.of(JsonNode.createArrayNode(List.of()), "Prueba"));
  }

  @Test
  void requiredAndHas() {
    var config = reader("rounds", number(3));
    assertTrue(config.has("rounds"));
    assertFalse(config.has("laps"));
    assertEquals(3, config.required("rounds").getDoubleValue());
    rejects("falta laps", () -> config.required("laps"));
  }

  @Test
  void integerAcceptsBoundsAndWholeDoubles() {
    assertEquals(10, reader("roundSeconds", number(10)).integer("roundSeconds", 10, 60));
    assertEquals(60, reader("roundSeconds", number(60)).integer("roundSeconds", 10, 60));
    assertEquals(10, reader("roundSeconds", number(10.0)).integer("roundSeconds", 10, 60));
  }

  @Test
  void integerRejectsFractionsWrongTypeMissingAndOutOfRangeIncludingUnsafe() {
    Consumer<ConfigReader> read = config -> config.integer("roundSeconds", 10, 60);
    rejectsWith("roundSeconds", number(9), "roundSeconds debe estar entre 10 y 60", read);
    rejectsWith("roundSeconds", number(61), "roundSeconds debe estar entre 10 y 60", read);
    rejectsWith("roundSeconds", number(10.5), "roundSeconds debe ser un número entero", read);
    rejectsWith("roundSeconds", number(9_007_199_254_740_992d), "roundSeconds debe estar entre 10 y 60", read);
    rejectsWith("roundSeconds", number(1e20), "roundSeconds debe estar entre 10 y 60", read);
    rejectsWith("roundSeconds", JsonNode.createStringNode("10"), "roundSeconds debe ser un número entero", read);
    rejectsWith("laps", number(10), "falta roundSeconds", read);
  }

  @Test
  void integerOfAnElementUsesTheGivenKey() {
    var config = reader("x", number(1));
    assertEquals(2, config.integer(number(2), "generations", 1, 9));
    rejects("generations debe estar entre 1 y 9", () -> config.integer(number(10), "generations", 1, 9));
  }

  @Test
  void safeIntegerAcceptsTheLargestSafeValueAndRejectsTwoToTheFiftyThree() {
    assertEquals(9_007_199_254_740_991L,
        reader("budget", number(9_007_199_254_740_991d)).safeInteger("budget"));
    assertEquals(20L, reader("budget", number(20.0)).safeInteger("budget"));
    Consumer<ConfigReader> read = config -> config.safeInteger("budget");
    rejectsWith("budget", number(9_007_199_254_740_992d), "budget debe ser un número entero", read);
    rejectsWith("budget", number(1e20), "budget debe ser un número entero", read);
    rejectsWith("budget", number(20.5), "budget debe ser un número entero", read);
    rejectsWith("budget", JsonNode.createBooleanNode(true), "budget debe ser un número entero", read);
    rejectsWith("other", number(1), "falta budget", read);
  }

  @Test
  void optionAcceptsOnlyListedValues() {
    var options = Set.of(5, 10, 15, 20);
    assertEquals(10, reader("rounds", number(10.0)).option("rounds", options, "Las rondas deben ser 5, 10, 15 o 20"));
    Consumer<ConfigReader> read = config -> config.option("rounds", options, "Las rondas deben ser 5, 10, 15 o 20");
    rejectsWith("rounds", number(11), "Las rondas deben ser 5, 10, 15 o 20", read);
    rejectsWith("rounds", number(4_294_967_306d), "Las rondas deben ser 5, 10, 15 o 20", read);
    rejectsWith("rounds", number(10.5), "rounds debe ser un número entero", read);
  }

  @Test
  void bool() {
    assertTrue(reader("hintsEnabled", JsonNode.createBooleanNode(true)).bool("hintsEnabled"));
    assertFalse(reader("hintsEnabled", JsonNode.createBooleanNode(false)).bool("hintsEnabled"));
    Consumer<ConfigReader> read = config -> config.bool("hintsEnabled");
    rejectsWith("hintsEnabled", number(1), "hintsEnabled debe ser booleano", read);
    rejectsWith("hintsEnabled", JsonNode.createStringNode("true"), "hintsEnabled debe ser booleano", read);
    rejectsWith("other", JsonNode.createBooleanNode(true), "falta hintsEnabled", read);
  }

  @Test
  void enumValueMatchesExactNames() {
    assertEquals(Mode.REVEAL, reader("mode", JsonNode.createStringNode("REVEAL")).enumValue("mode", Mode.class));
    Consumer<ConfigReader> read = config -> config.enumValue("mode", Mode.class);
    rejectsWith("mode", JsonNode.createStringNode("reveal"), "mode tiene un valor no válido", read);
    rejectsWith("mode", number(0), "mode tiene un valor no válido", read);
    rejectsWith("other", JsonNode.createStringNode("REVEAL"), "falta mode", read);
    rejects("mode debe ser A o B",
        () -> reader("mode", JsonNode.createStringNode("C")).enumValue("mode", Mode.class, "mode debe ser A o B"));
    assertEquals(Mode.REALTIME,
        reader("x", number(1)).enumValue(JsonNode.createStringNode("REALTIME"), "categories", Mode.class));
  }

  @Test
  void generationsDeduplicatesAndSorts() {
    var list = JsonNode.createArrayNode(List.of(number(9), number(1), number(9), number(3.0)));
    assertEquals(List.of(1, 3, 9), reader("generations", list).generations("generations"));
    Consumer<ConfigReader> read = config -> config.generations("generations");
    rejectsWith("generations", JsonNode.createArrayNode(List.of()),
        "generations debe ser una lista con al menos una generación", read);
    rejectsWith("generations", number(1), "generations debe ser una lista con al menos una generación", read);
    rejectsWith("generations", JsonNode.createArrayNode(List.of(number(10))), "generations debe estar entre 1 y 9", read);
    rejectsWith("generations", JsonNode.createArrayNode(List.of(number(0))), "generations debe estar entre 1 y 9", read);
    rejectsWith("generations", JsonNode.createArrayNode(List.of(number(1.5))), "generations debe ser un número entero",
        read);
    rejectsWith("other", JsonNode.createArrayNode(List.of(number(1))), "falta generations", read);
  }

  @Test
  void allGenerations() {
    assertEquals(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9), ConfigReader.allGenerations());
  }

  @Test
  void strictRejectsUnknownKeys() {
    var config = ConfigReader.of(object(Map.of("rounds", number(3))), "Prueba");
    config.strict(Set.of("rounds", "laps"));
    rejects("clave desconocida rounds", () -> config.strict(Set.of("laps")));
  }

  @Test
  void nestedObjectSharesThePrefix() {
    var hints = object(Map.of("types", JsonNode.createBooleanNode(true)));
    var nested = reader("hints", hints).object("hints");
    assertTrue(nested.bool("types"));
    rejects("falta weight", () -> nested.bool("weight"));
    rejects("clave desconocida types", () -> nested.strict(Set.of("weight")));
    rejectsWith("hints", number(1), "hints debe ser un objeto", config -> config.object("hints"));
    rejectsWith("other", hints, "falta hints", config -> config.object("hints"));
  }

  @Test
  void invalidBuildsThePrefixedException() {
    assertEquals("Configuración de Prueba no válida: Selecciona al menos 2 estadísticas.",
        reader("x", number(1)).invalid("Selecciona al menos 2 estadísticas").getMessage());
  }

  // ------------------------------------------------------------------ modo que recoge todos los issues (collectIssues)

  private static JsonNode text(String value) {
    return JsonNode.createStringNode(value);
  }

  private static JsonNode array(JsonNode... values) {
    return JsonNode.createArrayNode(List.of(values));
  }

  private static List<List<Object>> paths(List<ConfigIssue> issues) {
    return issues.stream().map(ConfigIssue::path).toList();
  }

  @Test
  void firstErrorCarriesItsZodPath() {
    var raw = object(Map.of("hints", object(Map.of("types", number(1)))));
    var error = assertThrows(ConfigValidationException.class,
        () -> ConfigReader.of(raw, "Prueba").object("hints").bool("types"));
    assertEquals(List.of("hints", "types"), error.path());
    var generations = assertThrows(ConfigValidationException.class,
        () -> reader("generations", array(number(1), number(12))).generations("generations"));
    assertEquals(List.of("generations", 1), generations.path());
    assertEquals(List.of(), assertThrows(ConfigValidationException.class,
        () -> ConfigReader.of(text("x"), "Prueba")).path());
    assertEquals(List.of(), assertThrows(ConfigValidationException.class,
        () -> reader("a", number(1)).strict(Set.of())).path());
  }

  @Test
  void collectsEveryIssueWithItsPathInReadingOrder() {
    var entries = new LinkedHashMap<String, JsonNode>();
    entries.put("rounds", text("diez"));
    entries.put("visible", JsonNode.createBooleanNode(true));
    entries.put("hints", object(Map.of("types", number(1))));
    entries.put("generations", array(number(1), number(12), text("z")));
    entries.put("mode", text("OTRO"));
    var issues = ConfigReader.collectIssues(() -> {
      var config = ConfigReader.of(object(entries), "Prueba");
      config.integer("rounds", 1, 5);
      config.bool("visible");
      config.object("hints").bool("types");
      config.generations("generations");
      config.enumValue("mode", Mode.class);
      config.bool("missing");
    });
    assertEquals(List.of(List.of("rounds"), List.of("hints", "types"), List.of("generations", 1),
        List.of("generations", 2), List.of("mode"), List.of("missing")), paths(issues));
    assertEquals("Configuración de Prueba no válida: rounds debe ser un número entero.", issues.getFirst().message());
    assertEquals("Configuración de Prueba no válida: falta missing.", issues.getLast().message());
  }

  @Test
  void validInputCollectsNothing() {
    assertEquals(List.of(), ConfigReader.collectIssues(() -> reader("rounds", number(3)).integer("rounds", 1, 5)));
  }

  @Test
  void aBrokenObjectIsOneIssueAndItsFieldsAreNotRead() {
    var issues = ConfigReader.collectIssues(() -> {
      var hints = reader("hints", number(1)).object("hints");
      hints.bool("types");
      hints.strict(Set.of());
      hints.reject("weight", "hints.weight no vale");
    });
    assertEquals(List.of(List.of("hints")), paths(issues));
  }

  @Test
  void rejectRecordsAndContinuesWhileCollectingAndThrowsOtherwise() {
    var issues = ConfigReader.collectIssues(() -> {
      var config = reader("a", number(1));
      config.reject("a", "a no vale");
      config.reject("b", "b no vale");
    });
    assertEquals(List.of(List.of("a"), List.of("b")), paths(issues));
    var error = assertThrows(ConfigValidationException.class, () -> reader("a", number(1)).reject("a", "a no vale"));
    assertEquals("Configuración de Prueba no válida: a no vale.", error.getMessage());
    assertEquals(List.of("a"), error.path());
  }

  @Test
  void aThrownRuleCountsOnlyWhenNothingFailedBefore() {
    assertEquals(List.of(new ConfigIssue(List.of("maxPrice"), "Configuración de Prueba no válida: precio.")),
        ConfigReader.collectIssues(() -> {
          throw reader("maxPrice", number(1)).invalidAt("maxPrice", "precio");
        }));
    // Con un issue previo, la regla entre campos ya no se evalúa (Zod no la corre sobre una entrada rota).
    assertEquals(List.of(List.of("rounds")), paths(ConfigReader.collectIssues(() -> {
      var config = reader("rounds", text("x"));
      config.integer("rounds", 1, 5);
      throw config.invalidAt("maxPrice", "precio");
    })));
  }

  @Test
  void onlyTheFirstIssueOfAPathIsKept() {
    var issues = ConfigReader.collectIssues(() -> {
      var config = reader("roundSeconds", text("x"));
      config.option("roundSeconds", List.of(30, 60), "El tiempo no vale");
    });
    assertEquals(List.of(new ConfigIssue(List.of("roundSeconds"),
        "Configuración de Prueba no válida: roundSeconds debe ser un número entero.")), issues);
  }
}
