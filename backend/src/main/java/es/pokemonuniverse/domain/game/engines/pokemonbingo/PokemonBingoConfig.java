package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokemonBingoConfigSchema} de {@code pokemon-bingo/config.ts}); la raíz es
 * estricta y {@code families} no: sus claves desconocidas se descartan. {@code families} conserva el orden de
 * {@link #BINGO_FAMILY_KEYS}, que es el de la salida de Zod.
 */
@Serdeable
public record PokemonBingoConfig(int width, int height, int durationSeconds, List<Integer> generations,
    int maxConditionsPerCell, Map<String, Boolean> families) {

  /** {@code BINGO_FAMILY_KEYS} de {@code pokemon/conditions/types.ts}. */
  public static final List<String> BINGO_FAMILY_KEYS = List.of(
      "generation", "dexNumber", "type", "typeCombination", "typeCount",
      "hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal",
      "height", "weight", "evolutionStage", "legendaryStatus", "color", "abilities");

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS =
      Set.of("width", "height", "durationSeconds", "generations", "maxConditionsPerCell", "families");

  /** Familias desactivadas en {@code defaultPokemonBingoConfig}. */
  private static final Set<String> DEFAULT_OFF = Set.of("baseStatTotal", "legendaryStatus", "color", "abilities");

  public PokemonBingoConfig {
    generations = List.copyOf(generations);
    families = frozenMap(families);
  }

  /** {@code config.families[key]}; una clave ausente es {@code undefined} (falso). */
  public boolean family(String key) {
    return Boolean.TRUE.equals(families.get(key));
  }

  /** {@code activeBingoFamilies}: las familias activas en el orden de {@link #BINGO_FAMILY_KEYS}. */
  public List<String> activeFamilies() {
    return BINGO_FAMILY_KEYS.stream().filter(this::family).toList();
  }

  /** {@code defaultPokemonBingoConfig}. */
  public static PokemonBingoConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    var families = new LinkedHashMap<String, Boolean>();
    for (var key : BINGO_FAMILY_KEYS) families.put(key, !DEFAULT_OFF.contains(key));
    return new PokemonBingoConfig(3, 3, 120, generations, 1, families);
  }

  /**
   * {@code pokemonBingoConfigSchema.parse}: {@code generations} sin duplicados y ascendentes;
   * {@code maxConditionsPerCell} es {@code 1} o {@code 2}. Los enteros admiten {@code 3.0} (JS tiene un único tipo
   * numérico) y rechazan {@code 3.5}.
   */
  public static PokemonBingoConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!KEYS.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
    int width = integer(required(raw, "width"), "width", 2, 6);
    int height = integer(required(raw, "height"), "height", 2, 6);
    int durationSeconds = integer(required(raw, "durationSeconds"), "durationSeconds", 60, 300);
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    var maxNode = required(raw, "maxConditionsPerCell");
    if (!maxNode.isNumber() || (maxNode.getDoubleValue() != 1 && maxNode.getDoubleValue() != 2)) {
      throw invalid("maxConditionsPerCell debe ser 1 o 2");
    }
    return new PokemonBingoConfig(width, height, durationSeconds, new ArrayList<>(generations),
        (int) maxNode.getDoubleValue(), families(required(raw, "families")));
  }

  /** {@code bingoFamiliesSchema}: objeto no estricto con un booleano por familia. */
  private static Map<String, Boolean> families(JsonNode value) {
    if (!value.isObject()) throw invalid("families debe ser un objeto");
    var families = new LinkedHashMap<String, Boolean>();
    for (var key : BINGO_FAMILY_KEYS) {
      var flag = value.get(key);
      if (flag == null || !flag.isBoolean()) throw invalid("families." + key + " debe ser booleano");
      families.put(key, flag.getBooleanValue());
    }
    return families;
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

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Pokémon Bingo no válida: " + detail + ".");
  }
}
