package es.pokemonuniverse.domain.game.engines.whoami;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code whoAmIConfigSchema} de {@code who-am-i/config.ts}); estricta y sin modos: una clave
 * {@code mode} se rechaza como clave desconocida. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record WhoAmIConfig(List<Integer> generations, int maxLaps, int askSeconds, int answerSeconds) {

  private static final Set<String> KEYS = Set.of("generations", "maxLaps", "askSeconds", "answerSeconds");

  public WhoAmIConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultWhoAmIConfig}. */
  public static WhoAmIConfig defaults() {
    return new WhoAmIConfig(ConfigReader.allGenerations(), 10, 45, 20);
  }

  /** {@code whoAmIConfigSchema.parse}: objeto estricto; cada campo es un entero en sus límites ({@code 10.0} vale). */
  public static WhoAmIConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "¿Quién soy?");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int maxLaps = config.integer("maxLaps", 3, 20);
    int askSeconds = config.integer("askSeconds", 20, 90);
    int answerSeconds = config.integer("answerSeconds", 10, 60);
    return new WhoAmIConfig(generations, maxLaps, askSeconds, answerSeconds);
  }
}
