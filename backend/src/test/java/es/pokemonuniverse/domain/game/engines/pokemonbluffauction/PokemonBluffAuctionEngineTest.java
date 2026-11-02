package es.pokemonuniverse.domain.game.engines.pokemonbluffauction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionCuratedCategory;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionRule;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.PokemonBluffAuctionAction;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.pokemon.conditions.Condition;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionOperator;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque (el exportador no los graba), el
 * literal inalcanzable {@code Ya has pasado esta ronda.} y el reinicio de condiciones usadas.
 */
class PokemonBluffAuctionEngineTest {

  private final PokemonBluffAuctionEngine engine =
      new PokemonBluffAuctionEngine(GoldenManifests.of(PokemonBluffAuctionEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(PokemonCatalog catalog, int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(catalog, new Mulberry32(1)).players(list).now(1000).build();
  }

  private static GameContext context(int players) {
    return context(GoldenCatalogs.load("gen1-2"), players);
  }

  private static PokemonBluffAuctionConfig config(List<Integer> generations) {
    return new PokemonBluffAuctionConfig(generations, 20, 30, 5);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-bluff-auction", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonBluffAuctionEngine(other));
  }

  @Test
  void parsesIntegralDoublesInTheConfig() throws IOException {
    // Las fixtures no pueden llevar 30.0: JSON.stringify lo escribe como 30.
    var parsed = engine.parseConfig(
        json("{\"generations\":[2.0,1],\"bidSeconds\":0.0,\"demonstrationSeconds\":30.0,\"rounds\":10.0}"));
    assertEquals(new PokemonBluffAuctionConfig(List.of(1, 2), 0, 30, 10), parsed);
    for (var invalid : List.of("{\"generations\":[1],\"demonstrationSeconds\":30.5,\"rounds\":10}",
        "{\"generations\":[1],\"demonstrationSeconds\":1e20,\"rounds\":10}",
        "{\"generations\":[1],\"demonstrationSeconds\":30,\"rounds\":-5}")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseConfig(json(invalid)), invalid);
    }
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var raise = assertInstanceOf(PokemonBluffAuctionAction.RaiseBid.class,
        engine.parseAction(json("{\"type\":\"RAISE_BID\",\"amount\":3.0}")));
    assertEquals(3, raise.amount());
    // z.number().int().min(1) no tiene máximo: un entero enorme valida y lo rechaza la puja máxima.
    assertEquals(1e20, assertInstanceOf(PokemonBluffAuctionAction.RaiseBid.class,
        engine.parseAction(json("{\"type\":\"RAISE_BID\",\"amount\":1e20}"))).amount());
    assertInstanceOf(PokemonBluffAuctionAction.PassBid.class, engine.parseAction(json("{\"type\":\"PASS_BID\"}")));
    var id96 = "p".repeat(96);
    assertEquals(new PokemonBluffAuctionAction.SubmitPokemon(id96),
        engine.parseAction(json("{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"" + id96 + "\"}")));
    for (var invalid : List.of("{\"type\":\"RAISE_BID\",\"amount\":0}", "{\"type\":\"RAISE_BID\",\"amount\":1.5}",
        "{\"type\":\"RAISE_BID\",\"amount\":\"2\"}", "{\"type\":\"RAISE_BID\"}",
        "{\"type\":\"RAISE_BID\",\"amount\":2,\"extra\":true}", "{\"type\":\"PASS_BID\",\"amount\":1}",
        "{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"" + id96 + "p\"}", "{\"type\":\"SUBMIT_POKEMON\"}",
        "{\"type\":\"pass_bid\"}", "{\"amount\":1}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void startErrorsKeepTheTsLiterals() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(5)), context(2)));
    assertEquals("No hay especies normales disponibles para estas generaciones.", error.getMessage());
    // Un único Pokémon sin tipos ni otro dato que cumpla una condición curada: no queda ninguna plantilla.
    var base = GoldenCatalogs.load("gen1-2").byId("bulbasaur").orElseThrow();
    var blank = new Pokemon("blank", 999, "Blank", 1, true, base.sprite(), base.shinySprite(), null, null, 50, 100,
        50, 50, 50, 50, 350, 50, 1, null, null, "NORMAL", "green", List.of(), Map.of(), List.of());
    var catalog = new InMemoryPokemonCatalog(List.of(blank));
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1)), context(catalog, 2)));
    assertEquals("No se pudieron generar condiciones interesantes para este pool.", error.getMessage());
    var context = context(2);
    var started = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    error = assertThrows(EngineException.class, () -> engine.getResults(started));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  @Test
  void aPlayerWhoAlreadyPassedCannotBidOnTheirTurn() {
    // Inalcanzable por la API: advanceTurn nunca deja el turno en quien ya pasó.
    var context = context(2);
    var started = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    var turn = engine.getPublicState(started, context).currentTurnPlayerId();
    var passed = started.toBuilder().passedPlayerIds(List.of(turn)).build();
    var result = engine.handleAction(passed, turn, new PokemonBluffAuctionAction.PassBid(), context);
    assertFalse(result.accepted());
    assertEquals("Ya has pasado esta ronda.", result.error());
  }

  @Test
  void usedConditionKeysResetOnceEveryTemplateHasBeenPlayed() {
    var context = context(2);
    var initial = engine.createInitialState(config(List.of(1)), context);
    var only = initial.toBuilder().conditionTemplates(initial.conditionTemplates().subList(0, 1)).build();
    var started = engine.start(only, context);
    assertEquals(GamePhase.ROUND_ACTIVE, started.phase());
    assertEquals(initial.conditionTemplates().getFirst().key(), started.condition().key());
    assertEquals(List.of(), started.usedConditionKeys());
    var two = initial.toBuilder().conditionTemplates(initial.conditionTemplates().subList(0, 2)).build();
    assertEquals(1, engine.start(two, context).usedConditionKeys().size());
  }

  @Test
  void spectatorsCannotAct() {
    var context = context(2);
    var state = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    var spectator = engine.getPlayerState(state, "p9", context);
    assertEquals("SPECTATOR", spectator.role());
    assertFalse(spectator.canRaise() || spectator.canPass() || spectator.canSubmitPokemon());
  }

  @Test
  void describesBluffSpecificClauses() {
    // Valores esperados de describeBluffAuctionConditions en el dist de shared.
    var view = PokemonBluffAuctionConditions.describeBluffAuctionConditions(List.of(
        new BluffAuctionRule.Standard(new Condition.Stat("speed", ConditionOperator.GT, 99)),
        new BluffAuctionRule.Standard(new Condition.Stat("hp", ConditionOperator.LT, 99)),
        new BluffAuctionRule.Standard(new Condition.Stat("specialDefense", ConditionOperator.GT, 100)),
        new BluffAuctionRule.CuratedCategory(BluffAuctionCuratedCategory.FOSSIL),
        new BluffAuctionRule.Standard(new Condition.Ability("cuerpo-puro")),
        new BluffAuctionRule.Standard(new Condition.Physical("weightHectograms", ConditionOperator.GT, 2000)),
        new BluffAuctionRule.Standard(new Condition.Type("water"))));
    assertEquals("Velocidad ≥ 100 + PS < 99 + Defensa especial > 100 + Pokémon fósil + Tiene la habilidad Cuerpo Puro"
        + " + Peso > 200 kg + Tipo Agua", view.description());
    assertEquals(7, view.clauses().size());
    var omanyte = GoldenCatalogs.load("gen1-2").byId("omanyte").orElseThrow();
    assertTrue(PokemonBluffAuctionConditions.pokemonMatchesBluffAuctionCondition(omanyte,
        List.of(new BluffAuctionRule.CuratedCategory(BluffAuctionCuratedCategory.FOSSIL))));
    assertFalse(PokemonBluffAuctionConditions.pokemonMatchesBluffAuctionCondition(omanyte,
        List.of(new BluffAuctionRule.CuratedCategory(BluffAuctionCuratedCategory.FOSSIL),
            new BluffAuctionRule.Standard(new Condition.Type("fire")))));
  }
}
