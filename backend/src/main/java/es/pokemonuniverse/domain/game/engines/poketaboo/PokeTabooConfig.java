package es.pokemonuniverse.domain.game.engines.poketaboo;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Configuración normalizada ({@code pokeTabooConfigSchema} de {@code poke-taboo/config.ts}); el esquema es estricto. */
@Serdeable
public record PokeTabooConfig(List<Integer> generations, int roundSeconds, int laps, boolean includeRegionalForms) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  /** {@code tabooRoundSeconds}: las únicas duraciones admitidas. */
  static final List<Integer> ROUND_SECONDS = List.of(30, 45, 60, 90, 120);

  private static final Set<String> KEYS = Set.of("generations", "roundSeconds", "laps", "includeRegionalForms");

  public PokeTabooConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokeTabooConfig}. */
  public static PokeTabooConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new PokeTabooConfig(generations, 60, 1, true);
  }

  /**
   * {@code pokeTabooConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code roundSeconds} entero y uno de {@code tabooRoundSeconds} ({@code refine}). Los enteros admiten {@code 60.0}
   * (JS tiene un único tipo numérico) y rechazan {@code 60.5}.
   */
  public static PokeTabooConfig parse(JsonNode raw) {
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
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", Integer.MIN_VALUE, Integer.MAX_VALUE);
    if (!ROUND_SECONDS.contains(roundSeconds)) throw invalid("El tiempo debe ser 30, 45, 60, 90 o 120 segundos");
    int laps = integer(required(raw, "laps"), "laps", 1, 5);
    var includeRegionalForms = required(raw, "includeRegionalForms");
    if (!includeRegionalForms.isBoolean()) throw invalid("includeRegionalForms debe ser booleano");
    return new PokeTabooConfig(new ArrayList<>(generations), roundSeconds, laps,
        includeRegionalForms.getBooleanValue());
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
    return new ConfigValidationException("Configuración de PokéTaboo no válida: " + detail + ".");
  }
}
