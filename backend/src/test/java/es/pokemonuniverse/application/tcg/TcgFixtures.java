package es.pokemonuniverse.application.tcg;

import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Lectura de las fixtures de {@code src/test/resources/tcg/} (las mismas que usa {@code scripts/export-tcg-parity.mts}). */
public final class TcgFixtures {

  public static final ObjectMapper JSON = ObjectMapper.getDefault();

  private TcgFixtures() {}

  public static JsonNode read(String resource) {
    try (var in = TcgFixtures.class.getResourceAsStream(resource)) {
      if (in == null) throw new IllegalStateException("Falta " + resource);
      return JSON.readValue(in.readAllBytes(), JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  static String text(JsonNode node) {
    return node == null || node.isNull() ? null : node.getStringValue();
  }

  /** Una fila de {@code catalog-rows.json} como la devuelve el repositorio. */
  static TcgCardRepository.CardRow row(JsonNode row) {
    var prices = new ArrayList<TcgCardRepository.PriceRow>();
    for (var price : row.get("prices").values()) {
      prices.add(new TcgCardRepository.PriceRow(text(price.get("provider")), text(price.get("currency")),
          text(price.get("variant")), text(price.get("market")), Instant.parse(text(price.get("observedAt")))));
    }
    var generations = new ArrayList<Integer>();
    row.get("pokemonGenerations").values().forEach(value -> generations.add(value.getIntValue()));
    var set = row.get("set");
    return new TcgCardRepository.CardRow(text(row.get("id")), text(row.get("localId")), text(row.get("name")),
        text(row.get("rarity")), text(row.get("imageUrl")), text(set.get("id")), text(set.get("name")), generations,
        prices);
  }

  public static List<TcgCardRepository.CardRow> rows(String resource) {
    var rows = new ArrayList<TcgCardRepository.CardRow>();
    read(resource).values().forEach(value -> rows.add(row(value)));
    return rows;
  }

  public static TcgCardCatalog.Filters filters(JsonNode value) {
    var generations = new ArrayList<Integer>();
    value.get("generations").values().forEach(item -> generations.add(item.getIntValue()));
    var setIds = new ArrayList<String>();
    value.get("setIds").values().forEach(item -> setIds.add(item.getStringValue()));
    var rarities = new ArrayList<String>();
    value.get("rarities").values().forEach(item -> rarities.add(item.getStringValue()));
    return new TcgCardCatalog.Filters(generations, setIds, rarities, text(value.get("minPrice")),
        text(value.get("maxPrice")));
  }

  /** Objeto Java plano (números como {@link BigDecimal} sin ceros finales) para comparar por valor. */
  public static Object plain(JsonNode node) {
    if (node == null || node.isNull()) return null;
    if (node.isString()) return node.getStringValue();
    if (node.isBoolean()) return node.getBooleanValue();
    if (node.isNumber()) return new BigDecimal(node.getNumberValue().toString()).stripTrailingZeros();
    if (node.isArray()) {
      var list = new ArrayList<Object>();
      node.values().forEach(value -> list.add(plain(value)));
      return list;
    }
    Map<String, Object> map = new LinkedHashMap<>();
    node.entries().forEach(entry -> map.put(entry.getKey(), plain(entry.getValue())));
    return map;
  }

  /** Serializa un valor Java (records serdeables, mapas, listas) y lo devuelve como {@link #plain}. */
  public static Object plain(Object value) {
    try {
      return plain(JSON.readValue(JSON.writeValueAsString(value), JsonNode.class));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
