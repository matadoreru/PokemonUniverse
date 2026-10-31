package es.pokemonuniverse.domain.game.engines.whoiswhopokemon;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code whoIsWhoPokemonConfigSchema} de {@code who-is-who-pokemon/config.ts}). El esquema
 * es {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record WhoIsWhoPokemonConfig(
    List<Integer> generations,
    int boardSize,
    boolean includeForms,
    int turnSeconds,
    int rounds,
    int selectionSeconds,
    WhoIsWhoSecretSelection secretSelection) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  /** {@code .default(30)} de {@code selectionSeconds}. */
  static final int DEFAULT_SELECTION_SECONDS = 30;

  private static final Set<String> KEYS = Set.of("generations", "boardSize", "includeForms", "turnSeconds", "rounds",
      "selectionSeconds", "secretSelection");

  public enum WhoIsWhoSecretSelection { RANDOM, PLAYER_CHOICE }

  public WhoIsWhoPokemonConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultWhoIsWhoPokemonConfig}. */
  public static WhoIsWhoPokemonConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new WhoIsWhoPokemonConfig(generations, 24, true, 40, 25, DEFAULT_SELECTION_SECONDS,
        WhoIsWhoSecretSelection.RANDOM);
  }

  /**
   * {@code whoIsWhoPokemonConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code selectionSeconds} ausente vale 30 ({@code null} no es ausente: no valida). Los enteros admiten {@code 10.0}
   * y rechazan {@code 10.5}.
   */
  public static WhoIsWhoPokemonConfig parse(JsonNode raw) {
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
    int boardSize = integer(required(raw, "boardSize"), "boardSize", 5, 50);
    var includeForms = required(raw, "includeForms");
    if (!includeForms.isBoolean()) throw invalid("includeForms debe ser booleano");
    int turnSeconds = integer(required(raw, "turnSeconds"), "turnSeconds", 10, 120);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 25);
    var selectionNode = raw.get("selectionSeconds");
    int selectionSeconds = selectionNode == null ? DEFAULT_SELECTION_SECONDS
        : integer(selectionNode, "selectionSeconds", 0, 120);
    return new WhoIsWhoPokemonConfig(new ArrayList<>(generations), boardSize, includeForms.getBooleanValue(),
        turnSeconds, rounds, selectionSeconds, secretSelection(required(raw, "secretSelection")));
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

  /** {@code z.enum(['RANDOM', 'PLAYER_CHOICE'])}: solo el valor exacto. */
  private static WhoIsWhoSecretSelection secretSelection(JsonNode value) {
    if (value.isString()) {
      for (var constant : WhoIsWhoSecretSelection.values()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw invalid("secretSelection tiene un valor no válido");
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Quién es Quién — Pokémon no válida: " + detail + ".");
  }
}
