package es.pokemonuniverse.domain.game.engines.oneofusisfake;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/** Configuración normalizada ({@code oneOfUsIsFakeConfigSchema} de {@code one-of-us-is-fake/config.ts}); estricta. */
@Serdeable
public record OneOfUsIsFakeConfig(List<Integer> generations, int selectionSeconds, int discussionSeconds, int rounds,
    boolean fakeKnows, CategorySource categorySource, boolean includeRegionalForms) {

  private static final Set<String> KEYS = Set.of("generations", "selectionSeconds", "discussionSeconds", "rounds",
      "fakeKnows", "categorySource", "includeRegionalForms");

  public OneOfUsIsFakeConfig {
    generations = List.copyOf(generations);
  }

  /** {@code categorySourceSchema}: el {@code subjectivePromptSourceSchema} de {@code games/config.ts}. */
  public enum CategorySource { OFFICIAL, CUSTOM, BOTH }

  /** {@code defaultOneOfUsIsFakeConfig}. */
  public static OneOfUsIsFakeConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new OneOfUsIsFakeConfig(generations, 30, 120, 5, false, CategorySource.OFFICIAL, true);
  }

  /**
   * {@code oneOfUsIsFakeConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los
   * enteros admiten {@code 3.0} (JS tiene un único tipo numérico) y rechazan {@code 3.5}.
   */
  public static OneOfUsIsFakeConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "One of Us Is Fake");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int selectionSeconds = config.integer("selectionSeconds", 15, 120);
    int discussionSeconds = config.integer("discussionSeconds", 30, 600);
    int rounds = config.integer("rounds", 1, 30);
    boolean fakeKnows = config.bool("fakeKnows");
    var categorySource = config.enumValue("categorySource", CategorySource.class);
    boolean includeRegionalForms = config.bool("includeRegionalForms");
    return new OneOfUsIsFakeConfig(generations, selectionSeconds, discussionSeconds, rounds, fakeKnows,
        categorySource, includeRegionalForms);
  }
}
