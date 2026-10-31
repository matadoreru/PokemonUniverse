package es.pokemonuniverse.domain.game.engines.higherlower;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.TreeSet;

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

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

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
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new HigherLowerConfig(generations, Arrays.asList(HigherLowerCategory.values()), true,
        HigherLowerAnswerVisibility.REALTIME, HigherLowerDifficulty.NORMAL, 20, 10);
  }

  /**
   * {@code higherLowerConfigSchema.parse}: objeto obligatorio; las claves desconocidas se ignoran (el esquema no es
   * {@code .strict()}); {@code generations} sin duplicados y ascendentes; {@code categories} sin duplicados en orden de
   * primera aparición. Los enteros admiten {@code 10.0} (JS tiene un único tipo numérico) y rechazan {@code 10.5}.
   */
  public static HigherLowerConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    var categoriesNode = required(raw, "categories");
    if (!categoriesNode.isArray() || categoriesNode.size() < 1) {
      throw invalid("categories debe ser una lista con al menos una categoría");
    }
    var categories = new LinkedHashSet<HigherLowerCategory>();
    for (var value : categoriesNode.values()) categories.add(enumValue(value, "categories", HigherLowerCategory.class));
    var showPreviousValue = required(raw, "showPreviousValue");
    if (!showPreviousValue.isBoolean()) throw invalid("showPreviousValue debe ser booleano");
    return new HigherLowerConfig(
        new ArrayList<>(generations),
        new ArrayList<>(categories),
        showPreviousValue.getBooleanValue(),
        enumValue(required(raw, "answerVisibility"), "answerVisibility", HigherLowerAnswerVisibility.class),
        enumValue(required(raw, "difficulty"), "difficulty", HigherLowerDifficulty.class),
        integer(required(raw, "roundSeconds"), "roundSeconds", 10, 60),
        integer(required(raw, "rounds"), "rounds", 1, 50));
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

  /** {@code z.enum([...])}: solo cadenas con un valor exacto del enum. */
  private static <E extends Enum<E>> E enumValue(JsonNode value, String key, Class<E> type) {
    if (value.isString()) {
      for (var constant : type.getEnumConstants()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw invalid(key + " tiene un valor no válido");
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Higher or Lower no válida: " + detail + ".");
  }
}
