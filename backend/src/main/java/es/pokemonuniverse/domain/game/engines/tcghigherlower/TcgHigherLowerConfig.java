package es.pokemonuniverse.domain.game.engines.tcghigherlower;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Configuración normalizada ({@code tcgHigherLowerConfigSchema} de {@code tcg-higher-lower/config.ts}). El esquema no
 * es {@code .strict()}: las claves desconocidas se ignoran. Los precios se guardan tal cual llegan (sin canonizar).
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record TcgHigherLowerConfig(
    List<Integer> generations,
    List<String> setIds,
    List<String> rarities,
    @Nullable String minPrice,
    @Nullable String maxPrice,
    boolean showRarity,
    int rounds,
    int roundSeconds) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  /** {@code /^\d+(?:\.\d+)?$/}: {@code \d} es ASCII en JS (sin bandera {@code u}) y en Java. */
  private static final Pattern PRICE = Pattern.compile("\\d+(?:\\.\\d+)?");

  public TcgHigherLowerConfig {
    generations = List.copyOf(generations);
    setIds = List.copyOf(setIds);
    rarities = List.copyOf(rarities);
  }

  /** {@code defaultTcgHigherLowerConfig}. */
  public static TcgHigherLowerConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new TcgHigherLowerConfig(generations, List.of(), List.of(), null, null, true, 10, 15);
  }

  /**
   * {@code compareTcgPrices}: compara dos decimales no negativos sin pasar a coma flotante. {@link BigDecimal#compareTo}
   * ignora la escala ({@code 7.50} = {@code 7.5}), igual que la comparación TS de las formas canónicas.
   */
  public static int compareTcgPrices(String left, String right) {
    if (!PRICE.matcher(left).matches() || !PRICE.matcher(right).matches()) {
      throw new EngineException("Invalid canonical TCG price");
    }
    return Integer.signum(new BigDecimal(left).compareTo(new BigDecimal(right)));
  }

  /**
   * {@code tcgHigherLowerConfigSchema.parse}: objeto obligatorio; {@code generations} sin duplicados y ascendentes;
   * {@code setIds} y {@code rarities} sin duplicados en orden de primera aparición; los precios son
   * {@code .nullable()} (la clave es obligatoria, {@code null} vale). El {@code superRefine} exige
   * {@code minPrice <= maxPrice}. Los enteros admiten {@code 10.0} y rechazan {@code 10.5}.
   */
  public static TcgHigherLowerConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    var setIds = distinctStrings(required(raw, "setIds"), "setIds");
    var rarities = distinctStrings(required(raw, "rarities"), "rarities");
    var minPrice = price(required(raw, "minPrice"), "minPrice");
    var maxPrice = price(required(raw, "maxPrice"), "maxPrice");
    var showRarity = required(raw, "showRarity");
    if (!showRarity.isBoolean()) throw invalid("showRarity debe ser booleano");
    int rounds = integer(required(raw, "rounds"), "rounds", 5, 50);
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 5, 60);
    if (minPrice != null && maxPrice != null && compareTcgPrices(minPrice, maxPrice) > 0) {
      throw invalid("El precio máximo debe ser igual o mayor que el mínimo.");
    }
    return new TcgHigherLowerConfig(new ArrayList<>(generations), setIds, rarities, minPrice, maxPrice,
        showRarity.getBooleanValue(), rounds, roundSeconds);
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  /** {@code z.array(z.string().min(1)).transform(dedup)}. */
  private static List<String> distinctStrings(JsonNode value, String key) {
    if (!value.isArray()) throw invalid(key + " debe ser una lista");
    var items = new LinkedHashSet<String>();
    for (var item : value.values()) {
      if (!item.isString() || item.getStringValue().isEmpty()) throw invalid(key + " solo admite textos no vacíos");
      items.add(item.getStringValue());
    }
    return new ArrayList<>(items);
  }

  /** {@code optionalPriceSchema}: decimal no negativo como texto, o {@code null}. */
  @Nullable
  private static String price(JsonNode value, String key) {
    if (value.isNull()) return null;
    if (!value.isString() || !PRICE.matcher(value.getStringValue()).matches()) {
      throw invalid(key + ": Introduce un precio válido.");
    }
    return value.getStringValue();
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
    return new ConfigValidationException("Configuración de Higher or Lower: Cartas no válida: " + detail
        + (detail.endsWith(".") ? "" : "."));
  }
}
