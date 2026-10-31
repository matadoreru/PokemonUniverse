package es.pokemonuniverse.domain.game.engines.pokemonredflag;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Configuración normalizada ({@code pokemonRedFlagConfigSchema} de {@code pokemon-red-flag/config.ts}); estricta. */
@Serdeable
public record PokemonRedFlagConfig(List<Integer> generations, int rounds, int phaseSeconds, boolean includeForms,
    PokemonRedFlagMode mode) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS = Set.of("generations", "rounds", "phaseSeconds", "includeForms", "mode");

  public PokemonRedFlagConfig {
    generations = List.copyOf(generations);
  }

  /** {@code mode}: {@code z.enum(['RED', 'GREEN', 'MIXED'])}. */
  public enum PokemonRedFlagMode { RED, GREEN, MIXED }

  /** {@code defaultPokemonRedFlagConfig}. */
  public static PokemonRedFlagConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new PokemonRedFlagConfig(generations, 5, 30, true, PokemonRedFlagMode.RED);
  }

  /**
   * {@code pokemonRedFlagConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los
   * enteros admiten {@code 3.0} (JS tiene un único tipo numérico) y rechazan {@code 3.5}.
   */
  public static PokemonRedFlagConfig parse(JsonNode raw) {
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
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 10);
    int phaseSeconds = integer(required(raw, "phaseSeconds"), "phaseSeconds", 15, 120);
    var includeForms = required(raw, "includeForms");
    if (!includeForms.isBoolean()) throw invalid("includeForms debe ser booleano");
    return new PokemonRedFlagConfig(new ArrayList<>(generations), rounds, phaseSeconds, includeForms.getBooleanValue(),
        mode(required(raw, "mode")));
  }

  private static PokemonRedFlagMode mode(JsonNode value) {
    if (value.isString()) {
      for (var constant : PokemonRedFlagMode.values()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw invalid("mode tiene un valor no válido");
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
    return new ConfigValidationException("Configuración de Pokémon Red Flag no válida: " + detail + ".");
  }
}
