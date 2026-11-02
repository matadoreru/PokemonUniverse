package es.pokemonuniverse.application.datasync.tcg;

import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Normalización de las respuestas de TCGdex ({@code priceLeaves} e {@code imageUrl} de {@code tcg-data-sync.ts}). */
public final class TcgDexPayloads {

  private static final Pattern IMAGE = Pattern.compile(".*\\.(png|webp|jpe?g)$", Pattern.CASE_INSENSITIVE);
  private static final Pattern DATE_ONLY = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

  private TcgDexPayloads() {}

  /**
   * Un precio de un proveedor y variante, clave del upsert {@code (cardId, provider, currency, variant)}. Los importes
   * son el texto más corto del {@code number} de JS ({@code String(n)}), como los convierte Prisma a {@code Decimal}.
   */
  public record PriceLeaf(String provider, String currency, String variant, @Nullable BigDecimal market,
      @Nullable BigDecimal low, @Nullable BigDecimal mid, @Nullable BigDecimal high, @Nullable BigDecimal trend,
      JsonNode metadata) {}

  private static boolean isRecord(@Nullable JsonNode value) {
    return value != null && value.isObject();
  }

  /** {@code typeof record[key] === 'number' ? record[key] : undefined}. */
  private static @Nullable BigDecimal number(JsonNode record, String key) {
    var value = record.get(key);
    if (value == null || !value.isNumber()) return null;
    return new BigDecimal(JsNumbers.format(value.getNumberValue()));
  }

  /**
   * {@code priceLeaves}: {@code cardmarket} da {@code standard} (avg/low/trend) y, si hay {@code avg-holo} o
   * {@code low-holo}, {@code holo}; los demás proveedores, una variante por cada clave con objeto salvo
   * {@code unit}/{@code updated}. La moneda es {@code unit} o, si falta, USD para {@code tcgplayer} y EUR para el
   * resto. Se descartan las hojas sin ningún importe numérico.
   */
  public static List<PriceLeaf> priceLeaves(@Nullable JsonNode pricing) {
    var leaves = new ArrayList<PriceLeaf>();
    if (!isRecord(pricing)) return leaves;
    for (var entry : pricing.entries()) {
      var provider = entry.getKey();
      var record = entry.getValue();
      if (!isRecord(record)) continue;
      var unit = record.get("unit");
      var currency = unit != null && unit.isString() ? unit.getStringValue()
          : provider.equals("tcgplayer") ? "USD" : "EUR";
      if (provider.equals("cardmarket")) {
        leaves.add(new PriceLeaf(provider, currency, "standard", number(record, "avg"), number(record, "low"), null,
            null, number(record, "trend"), record));
        if (number(record, "avg-holo") != null || number(record, "low-holo") != null) {
          leaves.add(new PriceLeaf(provider, currency, "holo", number(record, "avg-holo"), number(record, "low-holo"),
              null, null, number(record, "trend-holo"), record));
        }
        continue;
      }
      for (var variant : record.entries()) {
        var prices = variant.getValue();
        if (variant.getKey().equals("unit") || variant.getKey().equals("updated") || !isRecord(prices)) continue;
        leaves.add(new PriceLeaf(provider, currency, variant.getKey(), number(prices, "marketPrice"),
            number(prices, "lowPrice"), number(prices, "midPrice"), number(prices, "highPrice"), null, prices));
      }
    }
    leaves.removeIf(leaf -> leaf.market() == null && leaf.low() == null && leaf.mid() == null && leaf.high() == null
        && leaf.trend() == null);
    return leaves;
  }

  /** {@code imageUrl}: se conserva si ya acaba en png/webp/jpg/jpeg; si no, {@code <valor>/high.webp}. */
  public static @Nullable String imageUrl(@Nullable String value) {
    if (value == null || value.isEmpty()) return null;
    return IMAGE.matcher(value).matches() ? value : value + "/high.webp";
  }

  /**
   * {@code new Date(text)} para las fechas de TCGdex: {@code yyyy-MM-dd} es medianoche UTC y una fecha con hora lleva
   * su desplazamiento ({@code Z} o {@code ±hh:mm}). Lo que JS no entendería ({@code Invalid Date}) hace fallar el
   * upsert en Node; aquí lanza.
   */
  public static Instant date(String text) {
    try {
      if (DATE_ONLY.matcher(text).matches()) return LocalDate.parse(text).atStartOfDay(ZoneOffset.UTC).toInstant();
      return OffsetDateTime.parse(text.toUpperCase(Locale.ROOT)).toInstant();
    } catch (DateTimeParseException e) {
      throw new IllegalStateException("Invalid TCGdex date: " + text, e);
    }
  }
}
