package es.pokemonuniverse.domain.game.engines.mostlikelyto;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/** Configuración normalizada ({@code mostLikelyToConfigSchema} de {@code most-likely-to/config.ts}); estricta. */
@Serdeable
public record MostLikelyToConfig(List<Integer> generations, int rounds, int selectionSeconds, int votingSeconds,
    PromptSource promptSource, boolean includeForms) {

  private static final Set<String> KEYS =
      Set.of("generations", "rounds", "selectionSeconds", "votingSeconds", "promptSource", "includeForms");

  public MostLikelyToConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultMostLikelyToConfig}. */
  public static MostLikelyToConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new MostLikelyToConfig(generations, 5, 45, 30, PromptSource.OFFICIAL, true);
  }

  /**
   * {@code mostLikelyToConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los
   * enteros admiten {@code 3.0} (JS tiene un único tipo numérico) y rechazan {@code 3.5}.
   */
  public static MostLikelyToConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Most Likely To");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int rounds = config.integer("rounds", 1, 10);
    int selectionSeconds = config.integer("selectionSeconds", 15, 120);
    int votingSeconds = config.integer("votingSeconds", 15, 120);
    var promptSource = config.enumValue("promptSource", PromptSource.class);
    boolean includeForms = config.bool("includeForms");
    return new MostLikelyToConfig(generations, rounds, selectionSeconds, votingSeconds, promptSource, includeForms);
  }
}
