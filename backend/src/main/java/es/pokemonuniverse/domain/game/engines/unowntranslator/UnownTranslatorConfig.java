package es.pokemonuniverse.domain.game.engines.unowntranslator;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code unownTranslatorConfigSchema} de {@code unown-translator/config.ts}); estricta. Los
 * componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record UnownTranslatorConfig(
    List<Integer> generations,
    int rounds,
    int roundSeconds,
    int hintSeconds,
    UnownTranslatorMode mode) {

  private static final Set<String> KEYS = Set.of("generations", "rounds", "roundSeconds", "hintSeconds", "mode");

  public UnownTranslatorConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultUnownTranslatorConfig}. */
  public static UnownTranslatorConfig defaults() {
    return new UnownTranslatorConfig(ConfigReader.allGenerations(), 5, 60, 6, UnownTranslatorMode.CLASSIC);
  }

  /**
   * {@code unownTranslatorConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes; cada
   * campo es un entero en sus límites ({@code 10.0} vale y {@code 10.5} no); {@code mode} ausente es {@code CLASSIC}.
   */
  public static UnownTranslatorConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Traductor Unown");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int rounds = config.integer("rounds", 1, 10);
    int roundSeconds = config.integer("roundSeconds", 30, 120);
    int hintSeconds = config.integer("hintSeconds", 3, 15);
    var mode = config.enumValueOrDefault("mode", UnownTranslatorMode.class, UnownTranslatorMode.CLASSIC);
    return new UnownTranslatorConfig(generations, rounds, roundSeconds, hintSeconds, mode);
  }
}
