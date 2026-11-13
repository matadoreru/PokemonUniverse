package es.pokemonuniverse.domain.game.engines.oddoneout;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code oddOneOutConfigSchema} de {@code odd-one-out/config.ts}); estricta y sin modos: una
 * clave {@code mode} se rechaza como clave desconocida. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record OddOneOutConfig(List<Integer> generations, int rounds, int roundSeconds) {

  private static final Set<String> KEYS = Set.of("generations", "rounds", "roundSeconds");

  public OddOneOutConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultOddOneOutConfig}. */
  public static OddOneOutConfig defaults() {
    return new OddOneOutConfig(ConfigReader.allGenerations(), 10, 20);
  }

  /** {@code oddOneOutConfigSchema.parse}: objeto estricto; cada campo es un entero en sus límites ({@code 10.0} vale). */
  public static OddOneOutConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "El Intruso");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int rounds = config.integer("rounds", 3, 30);
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    return new OddOneOutConfig(generations, rounds, roundSeconds);
  }
}
