package es.pokemonuniverse.domain.game.engines.secretranking;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/** Configuración normalizada ({@code secretRankingConfigSchema} de {@code secret-ranking/config.ts}); estricta. */
@Serdeable
public record SecretRankingConfig(List<Integer> generations, int rounds, int roundSeconds, PromptSource promptSource,
    boolean includeForms) {

  private static final Set<String> KEYS =
      Set.of("generations", "rounds", "roundSeconds", "promptSource", "includeForms");

  public SecretRankingConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultSecretRankingConfig}. */
  public static SecretRankingConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new SecretRankingConfig(generations, 3, 45, PromptSource.OFFICIAL, true);
  }

  /**
   * {@code secretRankingConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los
   * enteros admiten {@code 3.0} (JS tiene un único tipo numérico) y rechazan {@code 3.5}.
   */
  public static SecretRankingConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Secret Ranking");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int rounds = config.integer("rounds", 1, 10);
    int roundSeconds = config.integer("roundSeconds", 15, 120);
    var promptSource = config.enumValue("promptSource", PromptSource.class);
    boolean includeForms = config.bool("includeForms");
    return new SecretRankingConfig(generations, rounds, roundSeconds, promptSource, includeForms);
  }
}
