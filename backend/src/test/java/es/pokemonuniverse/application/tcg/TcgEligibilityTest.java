package es.pokemonuniverse.application.tcg;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.errors.InvalidInputException;
import io.micronaut.json.tree.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Validación de {@code POST /api/tcg/eligibility} ({@code tcgHigherLowerConfigSchema.parse}). Cada caso de
 * {@code eligibility-cases.json} se compara con lo que hace Zod en Node ({@code expected-eligibility.json}): los datos
 * normalizados, el 400 {@code {error, issues}} completo o la excepción de {@code compareTcgPrices}.
 */
class TcgEligibilityTest {

  @Test
  void everyCaseMatchesZod() {
    var cases = TcgFixtures.read("/tcg/eligibility-cases.json");
    var expected = TcgFixtures.read("/tcg/expected-eligibility.json");
    assertEquals(cases.size(), expected.size());
    for (var entry : cases.entries()) {
      var name = entry.getKey();
      var outcome = expected.get(name);
      if (outcome.get("data") != null) {
        var data = outcome.get("data");
        var filters = TcgEligibility.parse(entry.getValue());
        assertEquals(TcgFixtures.filters(data), filters, name);
      } else if (outcome.get("throws") != null) {
        var error = assertThrows(IllegalArgumentException.class, () -> TcgEligibility.parse(entry.getValue()), name);
        assertEquals(outcome.get("throws").getStringValue(), error.getMessage(), name);
      } else {
        var error = assertThrows(InvalidInputException.class, () -> TcgEligibility.parse(entry.getValue()), name);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error.getMessage());
        body.put("issues", error.issues());
        assertEquals(TcgFixtures.plain(outcome), TcgFixtures.plain(body), name);
        assertEquals(keyOrder(outcome.get("issues")), keyOrder(TcgFixtures.plain(error.issues())), name);
      }
    }
  }

  /** Además del valor, el orden de las claves de cada incidencia (el JSON de Node lo conserva). */
  private static Object keyOrder(Object issues) {
    if (issues instanceof JsonNode node) {
      var keys = new java.util.ArrayList<Object>();
      for (var issue : node.values()) {
        var names = new java.util.ArrayList<String>();
        for (var field : issue.entries()) names.add(field.getKey());
        keys.add(names);
      }
      return keys;
    }
    var keys = new java.util.ArrayList<Object>();
    for (var issue : (java.util.List<?>) issues) keys.add(java.util.List.copyOf(((Map<?, ?>) issue).keySet()));
    return keys;
  }
}
