package es.pokemonuniverse.domain.game.engines.pokeddlerace;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokeddleRaceConfigSchema} de {@code pokeddle-race/config.ts}). La raíz es
 * {@code .strict()}; {@code clues} no lo es: exige las 17 pistas booleanas y descarta las claves desconocidas.
 * {@code clues} es un mapa en el orden de {@code POKEDDLE_CLUE_KEYS}, que es el orden en que Zod emite la salida.
 */
@Serdeable
public record PokeddleRaceConfig(List<Integer> generations, int roundSeconds, int maxRounds, Map<String, Boolean> clues) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  /** {@code POKEDDLE_CLUE_KEYS}, en su orden. */
  public static final List<String> CLUE_KEYS = List.of(
      "generation", "dexNumber", "types", "typeCount",
      "hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal",
      "height", "weight", "evolutionStage", "legendaryStatus", "color", "abilities");

  private static final Set<String> KEYS = Set.of("generations", "roundSeconds", "maxRounds", "clues");

  public PokeddleRaceConfig {
    generations = List.copyOf(generations);
    clues = frozenMap(clues);
  }

  /** {@code config.clues[key]}. */
  public boolean clue(String key) {
    return Boolean.TRUE.equals(clues.get(key));
  }

  /** {@code activePokeddleClues}: las pistas activas en el orden de {@code POKEDDLE_CLUE_KEYS}. */
  public List<String> activeClues() {
    return CLUE_KEYS.stream().filter(this::clue).toList();
  }

  /** {@code defaultPokeddleRaceConfig}. */
  public static PokeddleRaceConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    var disabled = Set.of("baseStatTotal", "legendaryStatus", "color", "abilities");
    var clues = new LinkedHashMap<String, Boolean>();
    for (var key : CLUE_KEYS) clues.put(key, !disabled.contains(key));
    return new PokeddleRaceConfig(generations, 20, 10, clues);
  }

  /**
   * {@code pokeddleRaceConfigSchema.parse}: raíz estricta; {@code generations} sin duplicados y ascendentes. Los enteros
   * admiten {@code 20.0} (JS tiene un único tipo numérico) y rechazan {@code 20.5}.
   */
  public static PokeddleRaceConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!KEYS.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 10, 60);
    int maxRounds = integer(required(raw, "maxRounds"), "maxRounds", 1, 30);
    var cluesNode = required(raw, "clues");
    if (!cluesNode.isObject()) throw invalid("clues debe ser un objeto");
    var clues = new LinkedHashMap<String, Boolean>();
    for (var key : CLUE_KEYS) {
      var value = required(cluesNode, key);
      if (!value.isBoolean()) throw invalid("clues." + key + " debe ser booleano");
      clues.put(key, value.getBooleanValue());
    }
    return new PokeddleRaceConfig(new ArrayList<>(generations), roundSeconds, maxRounds, clues);
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  /** {@code z.number().int().min(min).max(max)}. */
  private static int integer(JsonNode value, String key, int min, int max) {
    if (!value.isNumber()) throw invalid(key + " debe ser un número entero");
    double number = value.getDoubleValue();
    if (number != Math.rint(number) || Double.isInfinite(number)) throw invalid(key + " debe ser un número entero");
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Pokédle Race no válida: " + detail + ".");
  }
}
