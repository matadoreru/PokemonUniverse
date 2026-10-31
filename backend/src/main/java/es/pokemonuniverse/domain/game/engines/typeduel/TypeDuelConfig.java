package es.pokemonuniverse.domain.game.engines.typeduel;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/** Configuración normalizada ({@code typeDuelConfigSchema} de {@code type-duel/config.ts}). */
@Serdeable
public record TypeDuelConfig(List<Integer> generations, int typeSelectSeconds, int searchSeconds, int rounds) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  public TypeDuelConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultTypeDuelConfig}. */
  public static TypeDuelConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new TypeDuelConfig(generations, 15, 20, 10);
  }

  /**
   * {@code typeDuelConfigSchema.parse}: objeto obligatorio; las claves desconocidas se ignoran (el esquema no es
   * {@code .strict()}); {@code generations} ({@code pokemonGenerationsSchema}) sin duplicados y ascendentes. Los enteros
   * admiten {@code 10.0} (JS tiene un único tipo numérico) y rechazan {@code 10.5}.
   */
  public static TypeDuelConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    return new TypeDuelConfig(new ArrayList<>(generations),
        integer(required(raw, "typeSelectSeconds"), "typeSelectSeconds", 5, 60),
        integer(required(raw, "searchSeconds"), "searchSeconds", 10, 60),
        integer(required(raw, "rounds"), "rounds", 1, 50));
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
    return new ConfigValidationException("Configuración de Type Duel no válida: " + detail + ".");
  }
}
