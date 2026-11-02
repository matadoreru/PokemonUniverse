package es.pokemonuniverse.application.tcg;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/**
 * {@code CachedTcgCardCatalog} de {@code comparable-price.ts}. Las salidas esperadas ({@code expected-catalog.json}) son
 * las del catálogo de Node sobre las mismas filas ({@code catalog-rows.json}) y los mismos filtros
 * ({@code catalog-cases.json}); las genera {@code scripts/export-tcg-parity.mts}.
 */
class CachedTcgCardCatalogTest {

  private static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

  private static CachedTcgCardCatalog catalog(List<TcgCardRepository.CardRow> rows) {
    var catalog = new CachedTcgCardCatalog(() -> rows);
    catalog.refresh();
    return catalog;
  }

  private static TcgCardRepository.CardRow card(String id, String market) {
    return new TcgCardRepository.CardRow(id, id, "Card " + id, "Rare", "https://img.test/" + id + ".webp", "set",
        "Set", List.of(1), new ArrayList<>(List.of(new TcgCardRepository.PriceRow("cardmarket", "EUR", "standard",
            market, T0))));
  }

  private static TcgCardCatalog.Filters gen1() {
    return new TcgCardCatalog.Filters(List.of(1), List.of(), List.of(), null, null);
  }

  @Test
  void everyFilterCaseMatchesNode() {
    var catalog = catalog(TcgFixtures.rows("/tcg/catalog-rows.json"));
    var expected = TcgFixtures.read("/tcg/expected-catalog.json");
    var cases = TcgFixtures.read("/tcg/catalog-cases.json");
    assertEquals(cases.size(), expected.get("cardsFor").size());
    cases.entries().forEach(entry -> assertEquals(TcgFixtures.plain(expected.get("cardsFor").get(entry.getKey())),
        TcgFixtures.plain(catalog.cardsFor(TcgFixtures.filters(entry.getValue()))), entry.getKey()));
  }

  @Test
  void optionsMatchNodeWithCountsAndIcuOrder() {
    var catalog = catalog(TcgFixtures.rows("/tcg/catalog-rows.json"));
    var expected = TcgFixtures.read("/tcg/expected-catalog.json").get("options");
    assertEquals(TcgFixtures.plain(expected), TcgFixtures.plain(catalog.options()));
    // ICU: "ábside" < "base" < "Écarlate" < "Zeta"; "ábaco" < "abeto" < "Abeto" (tercer nivel).
    assertEquals(List.of("ábside", "base", "Écarlate", "Zeta"),
        catalog.options().sets().stream().map(TcgCardCatalog.SetOption::name).toList());
    assertEquals(List.of("ábaco", "abeto", "Abeto", "Common", "Promo", "Rare"),
        catalog.options().rarities().stream().map(TcgCardCatalog.RarityOption::value).toList());
  }

  @Test
  void generationFilterExcludesCardsWithoutLinkedPokemon() {
    var catalog = catalog(TcgFixtures.rows("/tcg/catalog-rows.json"));
    var all = catalog.cardsFor(new TcgCardCatalog.Filters(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9), List.of(), List.of(),
        null, null));
    assertFalse(all.stream().anyMatch(card -> card.id().equals("t-1")));
  }

  @Test
  void euroCardmarketStandardWinsOverUsdTcgplayerNormal() {
    var pool = catalog(TcgFixtures.rows("/tcg/catalog-rows.json")).cardsFor(gen1());
    assertTrue(pool.stream().allMatch(card -> card.currency().equals("EUR") && card.provider().equals("cardmarket")
        && card.variant().equals("standard")));
  }

  @Test
  void boundsAreInclusiveDecimalComparisons() {
    var catalog = catalog(TcgFixtures.rows("/tcg/catalog-rows.json"));
    var pool = catalog.cardsFor(new TcgCardCatalog.Filters(List.of(1), List.of(), List.of(), "1.10", "1.1"));
    assertEquals(List.of("a-1", "a-2"), pool.stream().map(TcgCardCatalog.Card::id).toList());
    assertEquals(List.of("1.1", "1.1"), pool.stream().map(TcgCardCatalog.Card::price).toList());
  }

  @Test
  void aLaneWithASingleCardIsDiscardedAndNoLaneMeansEmpty() {
    var catalog = catalog(TcgFixtures.rows("/tcg/catalog-rows.json"));
    assertEquals(List.of(), catalog.cardsFor(new TcgCardCatalog.Filters(List.of(5), List.of(), List.of(), null, null)));
  }

  @Test
  void zeroIsAValidPriceAndInvalidOnesAreIgnored() {
    var catalog = catalog(List.of(card("a", "0"), card("b", "4.2500"), card("null", null), card("neg", "-2"),
        card("nan", "NaN")));
    assertEquals(List.of("0", "4.25"), catalog.cardsFor(gen1()).stream().map(TcgCardCatalog.Card::price).toList());
    assertEquals(2, catalog.options().cardCount());
  }

  @Test
  void theNewestObservationWithACanonicalPriceWins() {
    var row = card("a", "4.2500");
    row.prices().addFirst(new TcgCardRepository.PriceRow("cardmarket", "EUR", "standard", "1",
        Instant.parse("2025-01-01T00:00:00Z")));
    row.prices().add(new TcgCardRepository.PriceRow("cardmarket", "EUR", "standard", "bad",
        Instant.parse("2027-01-01T00:00:00Z")));
    var pool = catalog(List.of(row, card("b", "3"))).cardsFor(gen1());
    assertEquals(List.of("4.25", "3"), pool.stream().map(TcgCardCatalog.Card::price).toList());
  }

  @Test
  void beforeTheFirstRefreshTheCatalogIsNotLoadedAndEmpty() {
    var catalog = new CachedTcgCardCatalog(() -> List.of(card("a", "1"), card("b", "2")));
    assertFalse(catalog.loaded());
    assertEquals(List.of(), catalog.cardsFor(gen1()));
    catalog.refresh();
    assertTrue(catalog.loaded());
    assertEquals(2, catalog.cardsFor(gen1()).size());
  }

  @Test
  void refreshSwapsTheWholeListAtOnce() {
    var rows = new AtomicReference<List<TcgCardRepository.CardRow>>(List.of(card("a", "1"), card("b", "2")));
    var catalog = new CachedTcgCardCatalog(rows::get);
    catalog.refresh();
    var before = catalog.cardsFor(gen1());
    rows.set(List.of(card("c", "1")));
    catalog.refresh();
    assertEquals(2, before.size());
    assertEquals(List.of(), catalog.cardsFor(gen1()));
    assertFalse(catalog.options().ready());
  }
}
