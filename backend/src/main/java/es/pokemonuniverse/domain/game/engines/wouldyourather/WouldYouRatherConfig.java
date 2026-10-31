package es.pokemonuniverse.domain.game.engines.wouldyourather;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.Set;

/** Configuración normalizada ({@code wouldYouRatherConfigSchema} de {@code would-you-rather/config.ts}); estricta. */
@Serdeable
public record WouldYouRatherConfig(int rounds, int roundSeconds, PromptSource promptSource) {

  private static final Set<String> KEYS = Set.of("rounds", "roundSeconds", "promptSource");

  /** {@code subjectivePromptSourceSchema} de {@code games/config.ts}. */
  public enum PromptSource { OFFICIAL, CUSTOM, BOTH }

  /** {@code defaultWouldYouRatherConfig}. */
  public static WouldYouRatherConfig defaults() {
    return new WouldYouRatherConfig(5, 45, PromptSource.OFFICIAL);
  }

  /**
   * {@code wouldYouRatherConfigSchema.parse}: objeto estricto. Los enteros admiten {@code 3.0} (JS tiene un único tipo
   * numérico) y rechazan {@code 3.5}.
   */
  public static WouldYouRatherConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!KEYS.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 10);
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 15, 120);
    return new WouldYouRatherConfig(rounds, roundSeconds, promptSource(required(raw, "promptSource")));
  }

  private static PromptSource promptSource(JsonNode value) {
    if (value.isString()) {
      for (var constant : PromptSource.values()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw invalid("promptSource tiene un valor no válido");
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
    return new ConfigValidationException("Configuración de Would You Rather no válida: " + detail + ".");
  }
}
