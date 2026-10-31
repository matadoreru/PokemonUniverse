package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokemonPaletteGuessConfigSchema} de {@code pokemon-palette-guess/config.ts}). El
 * esquema es {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record PokemonPaletteGuessConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    int paletteSize,
    boolean hintsEnabled,
    List<PokemonPaletteHintKind> hintKinds) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "rounds", "paletteSize", "hintsEnabled", "hintKinds");

  public PokemonPaletteGuessConfig {
    generations = List.copyOf(generations);
    hintKinds = List.copyOf(hintKinds);
  }

  /** {@code POKEMON_PALETTE_HINT_KINDS}. */
  public enum PokemonPaletteHintKind { GENERATION, TYPE, TYPE_COUNT, EVOLUTION, CATEGORY }

  /** {@code defaultPokemonPaletteGuessConfig}. */
  public static PokemonPaletteGuessConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new PokemonPaletteGuessConfig(generations, 25, 10, 8, false, List.of(PokemonPaletteHintKind.GENERATION,
        PokemonPaletteHintKind.TYPE, PokemonPaletteHintKind.EVOLUTION));
  }

  /**
   * {@code pokemonPaletteGuessConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code hintKinds} (puede estar vacío) sin duplicados en orden de primera aparición.
   */
  public static PokemonPaletteGuessConfig parse(JsonNode raw) {
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
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 10, 60);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 20);
    int paletteSize = integer(required(raw, "paletteSize"), "paletteSize", 5, 8);
    var hintsEnabled = required(raw, "hintsEnabled");
    if (!hintsEnabled.isBoolean()) throw invalid("hintsEnabled debe ser booleano");
    var kindsNode = required(raw, "hintKinds");
    if (!kindsNode.isArray()) throw invalid("hintKinds debe ser una lista");
    var hintKinds = new LinkedHashSet<PokemonPaletteHintKind>();
    for (var value : kindsNode.values()) hintKinds.add(enumValue(value, "hintKinds", PokemonPaletteHintKind.class));
    return new PokemonPaletteGuessConfig(new ArrayList<>(generations), roundSeconds, rounds, paletteSize,
        hintsEnabled.getBooleanValue(), new ArrayList<>(hintKinds));
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
    return new ConfigValidationException("Configuración de Adivina por la Paleta no válida: " + detail + ".");
  }
}
