package es.pokemonuniverse.domain.game;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.game.GameConfigReadiness.Context;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class GameConfigReadinessTest {

  private static JsonNode tree(Object value) {
    if (value instanceof Map<?, ?> map) {
      var out = new LinkedHashMap<String, JsonNode>();
      map.forEach((k, v) -> out.put((String) k, tree(v)));
      return JsonNode.createObjectNode(out);
    }
    if (value instanceof List<?> list) {
      var out = new ArrayList<JsonNode>();
      list.forEach(v -> out.add(tree(v)));
      return JsonNode.createArrayNode(out);
    }
    if (value instanceof Boolean b) return JsonNode.createBooleanNode(b);
    if (value instanceof Number n) return JsonNode.createNumberNodeImpl(n);
    if (value instanceof String s) return JsonNode.createStringNode(s);
    return JsonNode.nullNode();
  }

  private static Optional<String> validate(String gameId, Object config, int categories, int prompts) {
    return GameConfigReadiness.validate(gameId, tree(config), new Context(categories, prompts));
  }

  @Test
  void pokeddleNeedsOneClue() {
    assertEquals(Optional.of("Selecciona al menos una pista."), validate("pokeddle-race", Map.of("clues", Map.of("types", false)), 0, 0));
    assertEquals(Optional.of("Selecciona al menos una pista."), validate("pokeddle-race", "nope", 0, 0));
    assertEquals(Optional.empty(), validate("pokeddle-race", Map.of("clues", Map.of("types", true)), 0, 0));
  }

  @Test
  void bingoNeedsAFamilyAndEnoughDistinctConditions() {
    assertEquals(Optional.of("Selecciona al menos una familia de condiciones."),
        validate("pokemon-bingo", Map.of("families", Map.of("type", "yes")), 0, 0));
    assertEquals(Optional.of("No hay suficientes condiciones distintas de “Monotipo / doble tipo” para un tablero 2×2."),
        validate("pokemon-bingo", Map.of("families", Map.of("typeCount", true), "width", 2, "height", 2), 0, 0));
    assertEquals(Optional.empty(),
        validate("pokemon-bingo", Map.of("families", Map.of("type", true), "width", 3, "height", 6), 0, 0));
    assertEquals(Optional.of("No hay suficientes condiciones distintas de “Generación” para un tablero 2×2."),
        validate("pokemon-bingo", Map.of("families", Map.of("generation", true), "width", 2, "height", 2,
            "generations", List.of(1, 2, 3)), 0, 0));
    assertEquals(Optional.empty(), validate("pokemon-bingo", Map.of("families", Map.of("abilities", true), "width", 6,
        "height", 6), 0, 0));
    assertEquals(Optional.empty(), validate("pokemon-bingo", Map.of("families", Map.of("typeCount", true, "hp", true),
        "width", 6, "height", 6), 0, 0));
    assertEquals(Optional.empty(), validate("pokemon-bingo", Map.of("families", Map.of("typeCount", true)), 0, 0));
  }

  @Test
  void customSourcesNeedHostContent() {
    assertEquals(Optional.of("El host necesita al menos 2 categorías personales activas; ahora hay 1."),
        validate("one-of-us-is-fake", Map.of("categorySource", "CUSTOM"), 1, 0));
    assertEquals(Optional.empty(), validate("one-of-us-is-fake", Map.of("categorySource", "CUSTOM"), 2, 0));
    assertEquals(Optional.of("El host necesita al menos 2 categorías personales activas; ahora hay 0."),
        GameConfigReadiness.validate("one-of-us-is-fake", tree(Map.of("categorySource", "CUSTOM"))));
    for (var game : List.of("secret-ranking", "most-likely-to")) {
      assertEquals(Optional.of("El host necesita al menos una pregunta personal activa para usar solo preguntas personalizadas."),
          validate(game, Map.of("promptSource", "CUSTOM"), 0, 5));
      assertEquals(Optional.empty(), validate(game, Map.of("promptSource", "MIXED"), 0, 0));
    }
    assertEquals(Optional.of("El host necesita al menos un dilema personal activo para usar solo dilemas personalizados."),
        validate("would-you-rather", Map.of("promptSource", "CUSTOM"), 3, 0));
    assertEquals(Optional.empty(), validate("would-you-rather", Map.of("promptSource", "CUSTOM"), 0, 1));
    assertEquals(Optional.empty(), validate("type-chain", null, 0, 0));
  }
  @Test
  void impostorParityNeedsMoreInnocents() {
    assertEquals(Optional.of("Demasiados impostores: con 4 jugadores el máximo es 1."),
        GameConfigReadiness.validate("pokemon-impostor", tree(Map.of("impostorCount", 2)), new Context(0, 0, 4)));
    assertEquals(Optional.empty(),
        GameConfigReadiness.validate("pokemon-impostor", tree(Map.of("impostorCount", 2)), new Context(0, 0, 5)));
    assertEquals(Optional.of("Demasiados impostores: con 5 jugadores el máximo es 2."),
        GameConfigReadiness.validate("pokemon-impostor", tree(Map.of("impostorCount", 3)), new Context(0, 0, 5)));
    // Sin recuento de jugadores (constructor de 2 argumentos o EMPTY) no se comprueba.
    assertEquals(Optional.empty(), validate("pokemon-impostor", Map.of("impostorCount", 2), 0, 0));
    assertEquals(Optional.empty(), GameConfigReadiness.validate("pokemon-impostor", tree(Map.of("impostorCount", 2))));
    assertEquals(Optional.empty(),
        GameConfigReadiness.validate("pokedex-distance", tree(Map.of("impostorCount", 2)), new Context(0, 0, 4)));
  }
}
