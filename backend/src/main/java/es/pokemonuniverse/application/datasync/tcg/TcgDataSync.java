package es.pokemonuniverse.application.datasync.tcg;

import es.pokemonuniverse.adapters.out.http.SyncHttpClient;
import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.SyncResult;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * {@code TcgDataSync} de {@code tcg-data-sync.ts}, origen {@code TCGDEX}.
 *
 * <p>PRICE_REFRESH con cartas guardadas pide solo esas cartas (sin {@code /sets}) y de las existentes solo escribe
 * precios; los demás modos recorren {@code /sets} y cada {@code /sets/{id}} en orden (upsert del set) y después piden
 * las cartas únicas en lotes de 20 concurrentes con una pausa de 100 ms tras cada lote. Una carta sin {@code set.id}
 * cuenta como {@code skipped}.
 */
public class TcgDataSync implements DataSyncAdapter {

  static final int BATCH = 20;
  static final long BATCH_PAUSE_MS = 100;

  private final TcgCatalogStore store;
  private final SyncHttpClient http;
  private final TcgDexUrls urls;
  private final SyncHttpClient.Sleeper sleeper;
  private final Clock clock;

  public TcgDataSync(TcgCatalogStore store, SyncHttpClient http, TcgDexUrls urls, SyncHttpClient.Sleeper sleeper,
      Clock clock) {
    this.store = store;
    this.http = http;
    this.urls = urls;
    this.sleeper = sleeper;
    this.clock = clock;
  }

  @Override
  public DataSyncSource source() {
    return DataSyncSource.TCGDEX;
  }

  @Override
  public long recordsAvailable() {
    return store.countCards();
  }

  private Instant now() {
    return Instant.ofEpochMilli(clock.now());
  }

  @Override
  public SyncResult run(DataSyncMode mode) {
    var existing = new LinkedHashSet<>(store.cardIds());
    List<String> cardIds;
    if (mode == DataSyncMode.PRICE_REFRESH && !existing.isEmpty()) {
      cardIds = List.copyOf(existing);
    } else {
      cardIds = discoverThroughSets();
    }
    int inserted = 0;
    int updated = 0;
    int skipped = 0;
    var unique = List.copyOf(new LinkedHashSet<>(cardIds));
    for (int start = 0; start < unique.size(); start += BATCH) {
      for (var card : fetchCards(unique.subList(start, Math.min(start + BATCH, unique.size())))) {
        var setId = card.get("set") != null && card.get("set").isObject() ? card.get("set").get("id") : null;
        if (!truthy(setId)) {
          skipped++;
          continue;
        }
        var id = requiredText(card, "id");
        boolean exists = existing.contains(id);
        if (mode != DataSyncMode.PRICE_REFRESH || !exists) {
          store.upsertCard(cardRow(card, id, requiredText(setId)), now());
          if (exists) {
            updated++;
          } else {
            inserted++;
            existing.add(id);
          }
          store.replaceCardPokemon(id, dexIds(card.get("dexId")));
        } else {
          updated++;
        }
        store.upsertPrices(id, TcgDexPayloads.priceLeaves(card.get("pricing")), now());
      }
      pause();
    }
    var total = store.countCards();
    return new SyncResult(unique.size(), inserted, updated, skipped, String.valueOf(total),
        JsonNode.createObjectNode(Map.of("pricesRefreshed",
            JsonNode.createBooleanNode(mode == DataSyncMode.PRICE_REFRESH))));
  }

  /** {@code /sets} y, en orden, cada {@code /sets/{id}}: upsert del set y los ids de sus cartas. */
  private List<String> discoverThroughSets() {
    var sets = http.json(urls.sets(), "TCGdex sets");
    var cardIds = new ArrayList<String>();
    for (var summary : sets.values()) {
      var id = jsString(summary.get("id"));
      var set = http.json(urls.set(id), "TCGdex set " + id);
      store.upsertSet(setRow(set), now());
      var cards = set.get("cards");
      if (cards != null && cards.isArray()) {
        for (var card : cards.values()) cardIds.add(jsString(card.get("id")));
      }
    }
    return cardIds;
  }

  /** {@code Promise.all} de un lote: peticiones concurrentes, resultados en el orden pedido. */
  private List<JsonNode> fetchCards(List<String> ids) {
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = new ArrayList<Future<JsonNode>>();
      for (var id : ids) futures.add(executor.submit(() -> http.json(urls.card(id), "TCGdex card " + id)));
      var cards = new ArrayList<JsonNode>();
      for (var future : futures) {
        try {
          cards.add(future.get());
        } catch (ExecutionException e) {
          if (e.getCause() instanceof RuntimeException runtime) throw runtime;
          throw new IllegalStateException(e.getCause());
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException(e);
        }
      }
      return cards;
    }
  }

  private void pause() {
    try {
      sleeper.sleep(BATCH_PAUSE_MS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  private static TcgCatalogStore.SetRow setRow(JsonNode set) {
    var series = set.get("series");
    String seriesName = series != null && series.isString() ? series.getStringValue()
        : series != null && series.isObject() ? optionalText(series, "name") : null;
    var releaseDate = set.get("releaseDate");
    var cardCount = set.get("cardCount");
    Integer count = null;
    if (cardCount != null && cardCount.isObject()) {
      count = optionalInteger(cardCount, "total");
      if (count == null) count = optionalInteger(cardCount, "official");
    }
    return new TcgCatalogStore.SetRow(requiredText(set, "id"), requiredText(set, "name"), seriesName,
        optionalText(set, "logo"), optionalText(set, "symbol"),
        truthy(releaseDate) ? TcgDexPayloads.date(requiredText(releaseDate)) : null, count, set);
  }

  private TcgCatalogStore.CardRow cardRow(JsonNode card, String id, String setId) {
    var updated = card.get("updated");
    return new TcgCatalogStore.CardRow(id, optionalText(card, "localId"), setId, requiredText(card, "name"),
        optionalText(card, "category"), optionalInteger(card, "hp"), optionalText(card, "rarity"),
        TcgDexPayloads.imageUrl(optionalText(card, "image")), optionalText(card, "illustrator"), card,
        truthy(updated) ? TcgDexPayloads.date(requiredText(updated)) : now());
  }

  /** {@code card.dexId?.length ? ... : []}: los números de la Pokédex nacional de la carta. */
  private static List<Integer> dexIds(@Nullable JsonNode value) {
    var ids = new ArrayList<Integer>();
    if (value == null || !value.isArray()) return ids;
    for (var item : value.values()) {
      if (item.isNumber() && item.getNumberValue().doubleValue() == Math.rint(item.getNumberValue().doubleValue())) {
        ids.add(item.getNumberValue().intValue());
      }
    }
    return ids;
  }

  /** Valor verdadero en JS para los tipos de JSON. */
  private static boolean truthy(@Nullable JsonNode value) {
    if (value == null || value.isNull()) return false;
    if (value.isString()) return !value.getStringValue().isEmpty();
    if (value.isBoolean()) return value.getBooleanValue();
    if (value.isNumber()) {
      double number = value.getNumberValue().doubleValue();
      return number != 0 && !Double.isNaN(number);
    }
    return true;
  }

  /** {@code String(value)} de un id en una plantilla de JS (texto o número; si falta, {@code undefined}). */
  private static String jsString(@Nullable JsonNode value) {
    if (value == null) return "undefined";
    if (value.isString()) return value.getStringValue();
    if (value.isNumber()) return es.pokemonuniverse.domain.json.JsNumbers.format(value.getNumberValue());
    return String.valueOf(value);
  }

  /** {@code value ?? null} hacia una columna de texto: otro tipo hace fallar el upsert de Prisma; aquí lanza. */
  private static @Nullable String optionalText(JsonNode object, String key) {
    var value = object.get(key);
    if (value == null || value.isNull()) return null;
    if (!value.isString()) throw new IllegalStateException("TCGdex " + key + " is not a string");
    return value.getStringValue();
  }

  private static String requiredText(JsonNode object, String key) {
    var value = optionalText(object, key);
    if (value == null) throw new IllegalStateException("TCGdex " + key + " is missing");
    return value;
  }

  private static String requiredText(JsonNode value) {
    if (!value.isString()) throw new IllegalStateException("TCGdex value is not a string");
    return value.getStringValue();
  }

  /** {@code value ?? null} hacia una columna entera. */
  private static @Nullable Integer optionalInteger(JsonNode object, String key) {
    var value = object.get(key);
    if (value == null || value.isNull()) return null;
    if (!value.isNumber() || value.getNumberValue().doubleValue() != Math.rint(value.getNumberValue().doubleValue())) {
      throw new IllegalStateException("TCGdex " + key + " is not an integer");
    }
    return value.getNumberValue().intValue();
  }
}
