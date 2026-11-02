package es.pokemonuniverse.domain.game.engines.higherlower;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;

/** Configuración normalizada ({@code higherLowerConfigSchema} de {@code higher-lower/config.ts}). */
@Serdeable
public record HigherLowerConfig(
    List<Integer> generations,
    List<HigherLowerCategory> categories,
    boolean showPreviousValue,
    HigherLowerAnswerVisibility answerVisibility,
    HigherLowerDifficulty difficulty,
    int roundSeconds,
    int rounds) {

  public HigherLowerConfig {
    generations = List.copyOf(generations);
    categories = List.copyOf(categories);
  }

  public enum HigherLowerCategory {
    DEX_NUMBER, HP, ATTACK, DEFENSE, SPECIAL_ATTACK, SPECIAL_DEFENSE, SPEED, BASE_STAT_TOTAL
  }

  public enum HigherLowerAnswerVisibility { REALTIME, REVEAL }

  public enum HigherLowerDifficulty { VERY_EASY, EASY, NORMAL, HARD, VERY_HARD }

  /** {@code defaultHigherLowerConfig}. */
  public static HigherLowerConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new HigherLowerConfig(generations, Arrays.asList(HigherLowerCategory.values()), true,
        HigherLowerAnswerVisibility.REALTIME, HigherLowerDifficulty.NORMAL, 20, 10);
  }

  /**
   * {@code higherLowerConfigSchema.parse}: objeto obligatorio; las claves desconocidas se ignoran (el esquema no es
   * {@code .strict()}); {@code generations} sin duplicados y ascendentes; {@code categories} sin duplicados en orden de
   * primera aparición. Los enteros admiten {@code 10.0} (JS tiene un único tipo numérico) y rechazan {@code 10.5}.
   */
  public static HigherLowerConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Higher or Lower");
    var generations = config.generations("generations");
    var categoriesNode = config.required("categories");
    var categories = new LinkedHashSet<HigherLowerCategory>();
    if (!categoriesNode.isArray()) {
      config.reject("categories", "categories debe ser una lista con al menos una categoría");
    } else {
      if (categoriesNode.size() < 1) {
        config.rejectContinuable("categories", "categories debe ser una lista con al menos una categoría");
      }
      for (var value : categoriesNode.values()) {
        categories.add(config.enumValue(value, "categories", HigherLowerCategory.class));
      }
    }
    boolean showPreviousValue = config.bool("showPreviousValue");
    return new HigherLowerConfig(
        generations,
        new ArrayList<>(categories),
        showPreviousValue,
        config.enumValue("answerVisibility", HigherLowerAnswerVisibility.class),
        config.enumValue("difficulty", HigherLowerDifficulty.class),
        config.integer("roundSeconds", 10, 60),
        config.integer("rounds", 1, 50));
  }
}
