package es.pokemonuniverse.domain.game.engines.tcghigherlower;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
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

  /** {@code /^\d+(?:\.\d+)?$/}: {@code \d} es ASCII en JS (sin bandera {@code u}) y en Java. */
  private static final Pattern PRICE = Pattern.compile("\\d+(?:\\.\\d+)?");

  public TcgHigherLowerConfig {
    generations = List.copyOf(generations);
    setIds = List.copyOf(setIds);
    rarities = List.copyOf(rarities);
  }

  /** {@code defaultTcgHigherLowerConfig}. */
  public static TcgHigherLowerConfig defaults() {
    var generations = ConfigReader.allGenerations();
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
    var config = ConfigReader.of(raw, "Higher or Lower: Cartas");
    var generations = config.generations("generations");
    var setIds = distinctStrings(config, "setIds");
    var rarities = distinctStrings(config, "rarities");
    var minPrice = price(config, "minPrice");
    var maxPrice = price(config, "maxPrice");
    boolean showRarity = config.bool("showRarity");
    int rounds = config.integer("rounds", 5, 50);
    int roundSeconds = config.integer("roundSeconds", 5, 60);
    if (minPrice != null && maxPrice != null && compareTcgPrices(minPrice, maxPrice) > 0) {
      throw config.invalidAt("maxPrice", "El precio máximo debe ser igual o mayor que el mínimo");
    }
    return new TcgHigherLowerConfig(generations, setIds, rarities, minPrice, maxPrice, showRarity, rounds,
        roundSeconds);
  }

  /** {@code z.array(z.string().min(1)).transform(dedup)}. */
  private static List<String> distinctStrings(ConfigReader config, String key) {
    var value = config.required(key);
    var items = new LinkedHashSet<String>();
    if (!value.isArray()) {
      config.reject(key, key + " debe ser una lista");
      return new ArrayList<>(items);
    }
    for (var item : value.values()) {
      if (!item.isString()) {
        config.reject(key, key + " solo admite textos no vacíos");
      } else if (item.getStringValue().isEmpty()) {
        config.rejectContinuable(key, key + " solo admite textos no vacíos");
      } else {
        items.add(item.getStringValue());
      }
    }
    return new ArrayList<>(items);
  }

  /** {@code optionalPriceSchema}: decimal no negativo como texto, o {@code null}. */
  @Nullable
  private static String price(ConfigReader config, String key) {
    var value = config.required(key);
    if (value.isNull()) return null;
    if (!value.isString()) {
      config.reject(key, key + ": Introduce un precio válido");
      return null;
    }
    if (!PRICE.matcher(value.getStringValue()).matches()) {
      // invalid_format es continuable: Zod sigue y su superRefine compara este precio (y lanza; ver ConfigReader).
      config.rejectContinuable(key, key + ": Introduce un precio válido");
    }
    return value.getStringValue();
  }
}
