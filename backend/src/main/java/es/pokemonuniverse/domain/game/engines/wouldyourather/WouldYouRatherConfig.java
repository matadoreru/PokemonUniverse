package es.pokemonuniverse.domain.game.engines.wouldyourather;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.Set;

/** Configuración normalizada ({@code wouldYouRatherConfigSchema} de {@code would-you-rather/config.ts}); estricta. */
@Serdeable
public record WouldYouRatherConfig(int rounds, int roundSeconds, PromptSource promptSource) {

  private static final Set<String> KEYS = Set.of("rounds", "roundSeconds", "promptSource");

  /** {@code defaultWouldYouRatherConfig}. */
  public static WouldYouRatherConfig defaults() {
    return new WouldYouRatherConfig(5, 45, PromptSource.OFFICIAL);
  }

  /**
   * {@code wouldYouRatherConfigSchema.parse}: objeto estricto. Los enteros admiten {@code 3.0} (JS tiene un único tipo
   * numérico) y rechazan {@code 3.5}.
   */
  public static WouldYouRatherConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Would You Rather");
    config.strict(KEYS);
    int rounds = config.integer("rounds", 1, 10);
    int roundSeconds = config.integer("roundSeconds", 15, 120);
    return new WouldYouRatherConfig(rounds, roundSeconds, config.enumValue("promptSource", PromptSource.class));
  }
}
