package es.pokemonuniverse.domain.game.engines.typechain;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Configuración normalizada ({@code typeChainConfigSchema} de {@code type-chain/config.ts}); el esquema es estricto. */
@Serdeable
public record TypeChainConfig(List<Integer> generations, int turnSeconds) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS = Set.of("generations", "turnSeconds");

  public TypeChainConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultTypeChainConfig}. */
  public static TypeChainConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new TypeChainConfig(generations, 15);
  }

  /**
   * {@code typeChainConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los enteros
   * admiten {@code 15.0} (JS tiene un único tipo numérico) y rechazan {@code 15.5}.
   */
  public static TypeChainConfig parse(JsonNode raw) {
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
    return new TypeChainConfig(new ArrayList<>(generations),
        integer(required(raw, "turnSeconds"), "turnSeconds", 10, 45));
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
    return new ConfigValidationException("Configuración de Type Chain no válida: " + detail + ".");
  }
}
