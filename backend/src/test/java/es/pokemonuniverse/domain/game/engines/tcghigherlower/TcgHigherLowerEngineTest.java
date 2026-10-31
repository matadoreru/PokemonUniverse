package es.pokemonuniverse.domain.game.engines.tcghigherlower;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerChoice;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, la sala sin catálogo TCG ({@code runner.ts} no graba
 * {@code checkAvailability} y un {@code createInitialState} que lanza aborta la exportación) y la comparación decimal.
 */
class TcgHigherLowerEngineTest {

  private final TcgHigherLowerEngine engine = new TcgHigherLowerEngine(GoldenManifests.of(TcgHigherLowerEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(TcgCardCatalog cards) {
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1))
        .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).roomCode("GOLD01").tcgCards(cards).build();
  }

  private static TcgCardCatalog.Card card(String id, String price) {
    return new TcgCardCatalog.Card(id, id, "1", "sv1", "Set", "Rare", "https://example.com/" + id + ".webp", price,
        "EUR", "cardmarket", "normal");
  }

  /** Catálogo fijo que ignora los filtros. */
  private static TcgCardCatalog catalog(List<TcgCardCatalog.Card> cards) {
    return new TcgCardCatalog() {
      @Override public List<Card> cardsFor(Filters filters) { return cards; }

      @Override public FilterOptions options() { return new FilterOptions(true, cards.size(), List.of(), List.of(), List.of()); }
    };
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("tcg-higher-lower", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new TcgHigherLowerEngine(other));
  }

  @Test
  void parsesTheStrictAnswerAction() throws IOException {
    assertEquals(TcgHigherLowerChoice.SAME, engine.parseAction(json("{\"type\":\"ANSWER\",\"choice\":\"SAME\"}")).choice());
    for (var invalid : List.of("{\"type\":\"ANSWER\",\"choice\":\"same\"}",
        "{\"type\":\"ANSWER\",\"choice\":\"SAME\",\"extra\":1}", "{\"type\":\"ANSWER\"}",
        "{\"type\":\"VOTE\",\"choice\":\"SAME\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** Producción Java hasta la etapa 2C: {@code context.tcgCards} es nulo y el mazo ({@code ?? []}) está vacío. */
  @Test
  void withoutTcgCatalogTheGameIsUnavailable() {
    var context = context(null);
    var config = engine.defaultConfig();
    assertEquals(Optional.of("No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros."),
        engine.checkAvailability(config, context));
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(config, context));
    assertEquals("No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros. Ajusta las "
        + "generaciones, sets, rarezas o precios.", error.getMessage());
  }

  @Test
  void needsAtLeastTwoCards() {
    var config = engine.defaultConfig();
    var single = context(catalog(List.of(card("a", "1"))));
    assertEquals(Optional.of(TcgHigherLowerEngine.UNAVAILABLE), engine.checkAvailability(config, single));
    assertThrows(EngineException.class, () -> engine.createInitialState(config, single));
    var pair = context(catalog(List.of(card("a", "1"), card("b", "2"))));
    assertEquals(Optional.empty(), engine.checkAvailability(config, pair));
    assertEquals(config.rounds() + 1, engine.createInitialState(config, pair).sequence().size());
  }

  /** Decimales arbitrariamente largos sin pérdida: un {@code double} los igualaría. */
  @Test
  void comparesPricesAsDecimals() {
    assertEquals(0, TcgHigherLowerConfig.compareTcgPrices("007.50", "7.5"));
    assertEquals(1, TcgHigherLowerConfig.compareTcgPrices("10", "9.99"));
    assertEquals(-1, TcgHigherLowerConfig.compareTcgPrices("0.30000000000000000001", "0.30000000000000000002"));
    assertEquals(1, TcgHigherLowerConfig.compareTcgPrices("12345678901234567890.1", "12345678901234567890"));
    assertEquals(TcgHigherLowerChoice.SAME, TcgHigherLowerRules.tcgPriceComparison("3.50", "3.5"));
    assertEquals(TcgHigherLowerChoice.LOWER, TcgHigherLowerRules.tcgPriceComparison("999.99", "120"));
    var error = assertThrows(EngineException.class, () -> TcgHigherLowerConfig.compareTcgPrices("1e3", "1"));
    assertEquals("Invalid canonical TCG price", error.getMessage());
  }
}
