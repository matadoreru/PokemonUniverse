package es.pokemonuniverse.domain.game;

import static org.junit.jupiter.api.Assertions.assertEquals;

import static es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerationOptions.BINGO_FAMILY_KEYS;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.GameConfigReadiness.Context;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceConfig;
import es.pokemonuniverse.golden.WebContracts;
import io.micronaut.json.tree.JsonNode;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

  /** Objeto con las claves en orden: el fichero grabado se compara como texto. */
  private static LinkedHashMap<String, Object> object(Object... entries) {
    var out = new LinkedHashMap<String, Object>();
    for (int i = 0; i < entries.length; i += 2) out.put((String) entries[i], entries[i + 1]);
    return out;
  }

  private static final class Cases {
    private final List<LinkedHashMap<String, Object>> list = new ArrayList<>();

    void add(String gameId, Object config, int categories, int prompts, int players) {
      var context = new Context(categories, prompts, players);
      var entry = object("gameId", gameId, "config", config, "context", object(
          "hostCustomCategoryCount", categories, "hostWouldYouRatherPromptCount", prompts, "playerCount", players));
      entry.put("message", GameConfigReadiness.validate(gameId, tree(config), context).orElse(null));
      list.add(entry);
    }

    void add(String gameId, Object config) {
      add(gameId, config, 0, 0, 0);
    }

    Optional<String> last() {
      return Optional.ofNullable((String) list.getLast().get("message"));
    }
  }

  /**
   * Graba {@code web-contracts/readiness-cases.json} (juego, config, contexto y el mensaje de Java o {@code null}),
   * que lee {@code packages/shared/src/games/config-readiness.test.ts}: la web avisa en la sala con el mismo texto
   * con el que el servidor rechaza empezar. Cubre cada rama y cada juego con regla.
   */
  @Test
  void recordsTheCasesTheWebChecks() throws IOException {
    var cases = new Cases();
    var ruled = List.of("pokeddle-race", "pokemon-bingo", "pokemon-impostor", "one-of-us-is-fake", "secret-ranking",
        "most-likely-to", "would-you-rather");
    for (var game : ruled) {
      cases.add(game, null);
      cases.add(game, "nope");
      cases.add(game, List.of());
    }
    cases.add("type-chain", null);
    cases.add("type-chain", object("clues", object(), "families", object(), "promptSource", "CUSTOM"), 0, 0, 2);

    // Pokédle Race: una pista cualquiera, solo si vale exactamente true.
    for (var key : PokeddleRaceConfig.CLUE_KEYS) {
      cases.add("pokeddle-race", object("clues", object(key, true)));
      assertEquals(Optional.empty(), cases.last());
    }
    var allFalse = object();
    PokeddleRaceConfig.CLUE_KEYS.forEach(key -> allFalse.put(key, false));
    cases.add("pokeddle-race", object("clues", allFalse));
    cases.add("pokeddle-race", object("clues", object()));
    cases.add("pokeddle-race", object("clues", object("types", "yes")));
    cases.add("pokeddle-race", object("clues", object("types", 1)));
    cases.add("pokeddle-race", object("clues", object("types", null)));
    cases.add("pokeddle-race", object("clues", object("unknown", true)));
    cases.add("pokeddle-race", object("clues", null));
    cases.add("pokeddle-race", object("clues", List.of(true)));
    cases.add("pokeddle-race", object("clues", "types"));
    cases.add("pokeddle-race", object());

    // Pokémon Bingo: al menos una familia a true y, con una sola, condiciones distintas para todas las casillas.
    cases.add("pokemon-bingo", object());
    cases.add("pokemon-bingo", object("families", null));
    cases.add("pokemon-bingo", object("families", List.of(true)));
    cases.add("pokemon-bingo", object("families", object()));
    cases.add("pokemon-bingo", object("families", object("type", "yes"), "width", 5, "height", 5));
    cases.add("pokemon-bingo", object("families", object("type", 1), "width", 5, "height", 5));
    cases.add("pokemon-bingo", object("families", object("type", false, "hp", false)));
    // El límite de cada familia sola en un tablero n×1: el último n que cabe y el primero que no.
    for (var family : BINGO_FAMILY_KEYS) {
      Integer first = null;
      for (int n = 1; n <= 20 && first == null; n++) {
        var config = object("families", object(family, true), "width", n, "height", 1, "generations", List.of(1, 2, 3));
        if (GameConfigReadiness.validate("pokemon-bingo", tree(config)).isPresent()) first = n;
      }
      if (first == null) {
        cases.add("pokemon-bingo", object("families", object(family, true), "width", 20, "height", 20));
        assertEquals(Optional.empty(), cases.last());
      } else {
        cases.add("pokemon-bingo", object("families", object(family, true), "width", first - 1, "height", 1,
            "generations", List.of(1, 2, 3)));
        cases.add("pokemon-bingo", object("families", object(family, true), "width", first, "height", 1,
            "generations", List.of(1, 2, 3)));
        assertTrue(cases.last().isPresent(), family);
        cases.add("pokemon-bingo", object("families", object(family, true), "width", 1, "height", first,
            "generations", List.of(1, 2, 3)));
      }
    }
    cases.add("pokemon-bingo", object("families", object("generation", true), "width", 2, "height", 2,
        "generations", List.of(1, 2, 3)));
    cases.add("pokemon-bingo", object("families", object("generation", true), "width", 1, "height", 1));
    cases.add("pokemon-bingo", object("families", object("generation", true), "width", 1, "height", 1,
        "generations", "1"));
    cases.add("pokemon-bingo", object("families", object("generation", true), "width", 1, "height", 1,
        "generations", List.of()));
    cases.add("pokemon-bingo", object("families", object("typeCount", true), "width", 2.5, "height", 1));
    cases.add("pokemon-bingo", object("families", object("typeCount", true), "width", 2, "height", 2));
    cases.add("pokemon-bingo", object("families", object("typeCount", true)));
    cases.add("pokemon-bingo", object("families", object("typeCount", true), "width", 0, "height", 5));
    cases.add("pokemon-bingo", object("families", object("typeCount", true), "width", -2, "height", -2));
    cases.add("pokemon-bingo", object("families", object("typeCount", true), "width", "5", "height", 5));
    cases.add("pokemon-bingo", object("families", object("typeCount", true), "width", 5, "height", null));
    cases.add("pokemon-bingo", object("families", object("typeCount", true, "hp", true), "width", 6, "height", 6));
    cases.add("pokemon-bingo", object("families", object("typeCount", true, "hp", "yes"), "width", 6, "height", 6));

    // Pokémon Impostor: más inocentes que impostores, solo con jugadores conectados.
    for (int players : List.of(0, 3, 4, 5)) {
      for (int impostors : List.of(1, 2, 3)) {
        cases.add("pokemon-impostor", object("impostorCount", impostors), 0, 0, players);
      }
    }
    cases.add("pokemon-impostor", object("impostorCount", "2"), 0, 0, 4);
    cases.add("pokemon-impostor", object("impostorCount", null), 0, 0, 4);
    cases.add("pokemon-impostor", object(), 0, 0, 4);
    cases.add("pokemon-impostor", null, 0, 0, 4);
    cases.add("pokedex-distance", object("impostorCount", 2), 0, 0, 4);

    // Contenido personal del host: cada recuento a los dos lados de su mínimo.
    for (int categories : List.of(0, 1, 2, 3)) {
      cases.add("one-of-us-is-fake", object("categorySource", "CUSTOM"), categories, 5, 0);
    }
    cases.add("one-of-us-is-fake", object("categorySource", "MIXED"), 0, 0, 0);
    cases.add("one-of-us-is-fake", object("categorySource", "custom"), 0, 0, 0);
    cases.add("one-of-us-is-fake", object("categorySource", 1), 0, 0, 0);
    cases.add("one-of-us-is-fake", object("promptSource", "CUSTOM"), 0, 0, 0);
    for (var game : List.of("secret-ranking", "most-likely-to")) {
      cases.add(game, object("promptSource", "CUSTOM"), 0, 5, 0);
      cases.add(game, object("promptSource", "CUSTOM"), 1, 0, 0);
      cases.add(game, object("promptSource", "MIXED"), 0, 0, 0);
      cases.add(game, object("promptSource", true), 0, 0, 0);
      cases.add(game, object("categorySource", "CUSTOM"), 0, 0, 0);
    }
    cases.add("would-you-rather", object("promptSource", "CUSTOM"), 3, 0, 0);
    cases.add("would-you-rather", object("promptSource", "CUSTOM"), 0, 1, 0);
    cases.add("would-you-rather", object("promptSource", "PUBLIC"), 0, 0, 0);
    cases.add("would-you-rather", object("promptSource", null), 0, 0, 0);

    var games = cases.list.stream().filter(entry -> entry.get("message") != null).map(entry -> entry.get("gameId"))
        .collect(java.util.stream.Collectors.toSet());
    assertEquals(Set.copyOf(ruled), games);
    WebContracts.check("readiness-cases.json", cases.list);
  }
}
