package es.pokemonuniverse.domain.game;

import static es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerationOptions.BINGO_FAMILY_KEYS;

import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.json.tree.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Traducción literal de {@code games/config-readiness.ts}: requisitos de sala que el esquema de un juego no puede
 * expresar por sí solo.
 */
public final class GameConfigReadiness {

  /** {@code POKEDDLE_CLUE_KEYS} de {@code pokeddle-race/config.ts}. */
  public static final List<String> POKEDDLE_CLUE_KEYS = List.of(
      "generation", "dexNumber", "types", "typeCount",
      "hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal",
      "height", "weight", "evolutionStage", "legendaryStatus", "color", "abilities");

  private static final Map<String, String> BINGO_FAMILY_LABELS = Map.ofEntries(
      Map.entry("generation", "Generación"),
      Map.entry("dexNumber", "Número Pokédex"),
      Map.entry("type", "Tipo"),
      Map.entry("typeCombination", "Combinación exacta"),
      Map.entry("typeCount", "Monotipo / doble tipo"),
      Map.entry("hp", "HP"),
      Map.entry("attack", "Ataque"),
      Map.entry("defense", "Defensa"),
      Map.entry("specialAttack", "At. Especial"),
      Map.entry("specialDefense", "Def. Especial"),
      Map.entry("speed", "Velocidad"),
      Map.entry("baseStatTotal", "Total stats"),
      Map.entry("height", "Altura"),
      Map.entry("weight", "Peso"),
      Map.entry("evolutionStage", "Estado evolutivo"),
      Map.entry("legendaryStatus", "Legendario / Mítico"),
      Map.entry("color", "Color oficial"),
      Map.entry("abilities", "Habilidades"));

  /** {@code typeCombination} y {@code abilities} no tienen capacidad fija: no se comprueban. */
  private static final Map<String, Integer> SINGLE_BINGO_FAMILY_CAPACITY = Map.ofEntries(
      Map.entry("generation", 9),
      Map.entry("dexNumber", 11),
      Map.entry("type", 18),
      Map.entry("typeCount", 2),
      Map.entry("hp", 6),
      Map.entry("attack", 6),
      Map.entry("defense", 6),
      Map.entry("specialAttack", 6),
      Map.entry("specialDefense", 6),
      Map.entry("speed", 6),
      Map.entry("baseStatTotal", 6),
      Map.entry("height", 6),
      Map.entry("weight", 6),
      Map.entry("evolutionStage", 4),
      Map.entry("legendaryStatus", 3),
      Map.entry("color", 10));

  /** Recuentos de contenido personal del host; ausentes en TS equivalen a 0. */
  public record Context(int hostCustomCategoryCount, int hostWouldYouRatherPromptCount) {

    public static final Context EMPTY = new Context(0, 0);
  }

  private GameConfigReadiness() {}

  public static Optional<String> validate(String gameId, JsonNode config) {
    return validate(gameId, config, Context.EMPTY);
  }

  public static Optional<String> validate(String gameId, JsonNode config, Context context) {
    var value = record(config);
    if (gameId.equals("pokeddle-race")) {
      var clues = record(value.get("clues"));
      if (POKEDDLE_CLUE_KEYS.stream().noneMatch(key -> isTrue(clues.get(key)))) {
        return Optional.of("Selecciona al menos una pista.");
      }
    }
    if (gameId.equals("pokemon-bingo")) {
      var families = record(value.get("families"));
      var active = BINGO_FAMILY_KEYS.stream().filter(key -> isTrue(families.get(key))).toList();
      if (active.isEmpty()) return Optional.of("Selecciona al menos una familia de condiciones.");
      double width = numberOrZero(value.get("width"));
      double height = numberOrZero(value.get("height"));
      if (active.size() == 1 && width > 0 && height > 0) {
        var family = active.getFirst();
        Integer capacity;
        if (family.equals("generation")) {
          var generations = value.get("generations");
          capacity = generations != null && generations.isArray() ? generations.size() : 0;
        } else {
          capacity = SINGLE_BINGO_FAMILY_CAPACITY.get(family);
        }
        if (capacity != null && width * height > capacity) {
          return Optional.of("No hay suficientes condiciones distintas de “" + BINGO_FAMILY_LABELS.get(family)
              + "” para un tablero " + JsNumbers.format(width) + "×" + JsNumbers.format(height) + ".");
        }
      }
    }
    if (gameId.equals("one-of-us-is-fake") && isString(value.get("categorySource"), "CUSTOM")
        && context.hostCustomCategoryCount() < 2) {
      return Optional.of("El host necesita al menos 2 categorías personales activas; ahora hay "
          + context.hostCustomCategoryCount() + ".");
    }
    if ((gameId.equals("secret-ranking") || gameId.equals("most-likely-to"))
        && isString(value.get("promptSource"), "CUSTOM") && context.hostCustomCategoryCount() < 1) {
      return Optional.of("El host necesita al menos una pregunta personal activa para usar solo preguntas personalizadas.");
    }
    if (gameId.equals("would-you-rather") && isString(value.get("promptSource"), "CUSTOM")
        && context.hostWouldYouRatherPromptCount() < 1) {
      return Optional.of("El host necesita al menos un dilema personal activo para usar solo dilemas personalizados.");
    }
    return Optional.empty();
  }

  /** Objeto JSON o, si no lo es (nulo, array, escalar), un objeto vacío. */
  private static JsonNode record(JsonNode node) {
    return node != null && node.isObject() ? node : JsonNode.createObjectNode(Map.of());
  }

  private static boolean isTrue(JsonNode node) {
    return node != null && node.isBoolean() && node.getBooleanValue();
  }

  private static boolean isString(JsonNode node, String expected) {
    return node != null && node.isString() && node.getStringValue().equals(expected);
  }

  private static double numberOrZero(JsonNode node) {
    return node != null && node.isNumber() ? node.getDoubleValue() : 0;
  }
}
