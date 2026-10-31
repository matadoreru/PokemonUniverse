package es.pokemonuniverse.domain.game.engines.zoomedpokemon;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code zoomedPokemonConfigSchema} de {@code zoomed-pokemon/config.ts}). El esquema es
 * {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record ZoomedPokemonConfig(
    List<Integer> generations,
    ImageMode imageMode,
    int roundSeconds,
    int rounds,
    boolean hintsEnabled,
    List<HintKind> hintKinds,
    boolean includeForms) {

  /** {@code ZOOMED_POKEMON_IMAGE_MODES}. */
  public enum ImageMode { MIXED, SPRITE, ARTWORK }

  /** {@code ZOOMED_POKEMON_HINT_KINDS}. */
  public enum HintKind { GENERATION, TYPE, TYPE_COUNT, EVOLUTION, CATEGORY }

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS = Set.of("generations", "imageMode", "roundSeconds", "rounds",
      "hintsEnabled", "hintKinds", "includeForms");

  public ZoomedPokemonConfig {
    generations = List.copyOf(generations);
    hintKinds = List.copyOf(hintKinds);
  }

  /** {@code defaultZoomedPokemonConfig}. */
  public static ZoomedPokemonConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new ZoomedPokemonConfig(generations, ImageMode.MIXED, 30, 10, false,
        List.of(HintKind.GENERATION, HintKind.TYPE, HintKind.EVOLUTION), true);
  }

  /**
   * {@code zoomedPokemonConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code hintKinds} sin duplicados en orden de aparición ({@code [...new Set(values)]}, sin ordenar). Los enums
   * distinguen mayúsculas y los enteros admiten {@code 15.0} y rechazan {@code 15.5}.
   */
  public static ZoomedPokemonConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!KEYS.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    var imageMode = enumValue(required(raw, "imageMode"), ImageMode.class, "imageMode");
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 15, 60);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 20);
    boolean hintsEnabled = flag(raw, "hintsEnabled");
    var hintKindsNode = required(raw, "hintKinds");
    if (!hintKindsNode.isArray()) throw invalid("hintKinds debe ser una lista");
    var hintKinds = new LinkedHashSet<HintKind>();
    for (var value : hintKindsNode.values()) hintKinds.add(enumValue(value, HintKind.class, "hintKinds"));
    boolean includeForms = flag(raw, "includeForms");
    return new ZoomedPokemonConfig(new ArrayList<>(generations), imageMode, roundSeconds, rounds, hintsEnabled,
        new ArrayList<>(hintKinds), includeForms);
  }

  /** {@code z.enum([...])}: el texto exacto de una constante. */
  private static <E extends Enum<E>> E enumValue(JsonNode value, Class<E> type, String key) {
    if (value.isString()) {
      for (var constant : type.getEnumConstants()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw invalid(key + " no admite ese valor");
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  private static boolean flag(JsonNode raw, String key) {
    var value = required(raw, key);
    if (!value.isBoolean()) throw invalid(key + " debe ser booleano");
    return value.getBooleanValue();
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
    return new ConfigValidationException("Configuración de Zoomed Pokémon no válida: " + detail + ".");
  }
}
