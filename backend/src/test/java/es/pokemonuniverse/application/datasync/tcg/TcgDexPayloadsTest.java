package es.pokemonuniverse.application.datasync.tcg;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Normalización de las respuestas de TCGdex ({@code priceLeaves}, {@code imageUrl} y las URL de {@code tcg-data-sync.ts}). */
class TcgDexPayloadsTest {

  private static JsonNode json(String text) throws Exception {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static BigDecimal decimal(String value) {
    return new BigDecimal(value);
  }

  /** El caso de {@code tcg-data-sync.test.ts}. */
  @Test
  void priceLeavesExtractsProviderPricesIntoStableUpsertKeys() throws Exception {
    var leaves = TcgDexPayloads.priceLeaves(json("{\"cardmarket\":{\"unit\":\"EUR\",\"avg\":12.4,\"low\":10,"
        + "\"trend\":11.8},\"tcgplayer\":{\"unit\":\"USD\",\"holofoil\":{\"marketPrice\":14.2,\"lowPrice\":9,"
        + "\"highPrice\":20}}}"));
    assertEquals(2, leaves.size());
    var cardmarket = leaves.get(0);
    assertEquals(List.of("cardmarket", "EUR", "standard"), List.of(cardmarket.provider(), cardmarket.currency(),
        cardmarket.variant()));
    assertEquals(decimal("12.4"), cardmarket.market());
    assertEquals(decimal("10"), cardmarket.low());
    assertEquals(decimal("11.8"), cardmarket.trend());
    assertNull(cardmarket.mid());
    var holofoil = leaves.get(1);
    assertEquals(List.of("tcgplayer", "USD", "holofoil"), List.of(holofoil.provider(), holofoil.currency(),
        holofoil.variant()));
    assertEquals(decimal("14.2"), holofoil.market());
    assertEquals(decimal("9"), holofoil.low());
    assertEquals(decimal("20"), holofoil.high());
    assertEquals(json("{\"marketPrice\":14.2,\"lowPrice\":9,\"highPrice\":20}"), holofoil.metadata());
  }

  @Test
  void cardmarketHoloLeafDefaultCurrenciesAndDroppedLeaves() throws Exception {
    var leaves = TcgDexPayloads.priceLeaves(json("{\"cardmarket\":{\"avg\":1,\"low-holo\":2,\"trend-holo\":3},"
        + "\"tcgplayer\":{\"normal\":{\"marketPrice\":null,\"productId\":1},\"updated\":{\"x\":1},\"unit\":{\"y\":1},"
        + "\"reverse-holofoil\":{\"midPrice\":0.5}},\"other\":{\"normal\":{\"marketPrice\":\"3\"}},\"bad\":[1],"
        + "\"none\":null}"));
    assertEquals(List.of("cardmarket:EUR:standard", "cardmarket:EUR:holo", "tcgplayer:USD:reverse-holofoil"),
        leaves.stream().map(leaf -> leaf.provider() + ":" + leaf.currency() + ":" + leaf.variant()).toList());
    assertNull(leaves.get(1).market());
    assertEquals(decimal("2"), leaves.get(1).low());
    assertEquals(decimal("3"), leaves.get(1).trend());
    // El metadata de cardmarket es el registro entero del proveedor.
    assertEquals(json("{\"avg\":1,\"low-holo\":2,\"trend-holo\":3}"), leaves.get(1).metadata());
    assertEquals(List.of(), TcgDexPayloads.priceLeaves(json("[1]")));
    assertEquals(List.of(), TcgDexPayloads.priceLeaves(null));
  }

  /** Prisma convierte el {@code number} por su texto más corto: nada de expansión binaria del double. */
  @Test
  void pricesKeepTheShortestDecimalText() throws Exception {
    var leaf = TcgDexPayloads.priceLeaves(json("{\"cardmarket\":{\"avg\":1.00005,\"low\":0.1,\"trend\":1e-7}}"))
        .getFirst();
    assertEquals("1.00005", leaf.market().toPlainString());
    assertEquals("0.1", leaf.low().toPlainString());
    assertEquals(0, decimal("0.0000001").compareTo(leaf.trend()));
  }

  @Test
  void imageUrlAddsHighWebpUnlessItAlreadyHasAnImageExtension() {
    assertEquals("https://a/x/high.webp", TcgDexPayloads.imageUrl("https://a/x"));
    assertEquals("https://a/x.PNG", TcgDexPayloads.imageUrl("https://a/x.PNG"));
    assertEquals("https://a/x.jpeg", TcgDexPayloads.imageUrl("https://a/x.jpeg"));
    assertEquals("https://a/x.jpg", TcgDexPayloads.imageUrl("https://a/x.jpg"));
    assertEquals("https://a/x.gif/high.webp", TcgDexPayloads.imageUrl("https://a/x.gif"));
    assertNull(TcgDexPayloads.imageUrl(""));
    assertNull(TcgDexPayloads.imageUrl(null));
  }

  @Test
  void urlsEncodeIdsLikeEncodeUriComponent() {
    assertEquals("a%20b%2Fc%3F%23%25%2B%26%3D", TcgDexUrls.encodeUriComponent("a b/c?#%+&="));
    assertEquals("swsh3.5-1_!~*'()", TcgDexUrls.encodeUriComponent("swsh3.5-1_!~*'()"));
    assertEquals("%C3%A9%F0%9F%83%8F", TcgDexUrls.encodeUriComponent("é🃏"));
    var urls = new TcgDexUrls("https://api.tcgdex.net/v2/en/");
    assertEquals("https://api.tcgdex.net/v2/en/sets", urls.sets().toString());
    assertEquals("https://api.tcgdex.net/v2/en/sets/sv03.5", urls.set("sv03.5").toString());
    assertEquals("https://api.tcgdex.net/v2/en/cards/a%20b", urls.card("a b").toString());
  }

  /** {@code new Date(text)}: una fecha sola es medianoche UTC; con hora, su desplazamiento. */
  @Test
  void datesParseLikeJavaScript() {
    assertEquals(Instant.parse("1999-01-09T00:00:00Z"), TcgDexPayloads.date("1999-01-09"));
    assertEquals(Instant.parse("2025-08-18T17:41:34Z"), TcgDexPayloads.date("2025-08-18T19:41:34+02:00"));
    assertEquals(Instant.parse("2025-08-05T00:42:15Z"), TcgDexPayloads.date("2025-08-05T00:42:15.000Z"));
  }
}
