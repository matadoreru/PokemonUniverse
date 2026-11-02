package es.pokemonuniverse.domain.game.engines.pokemonteamauction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.PokemonTeamAuctionAction;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionParticipant;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque y el rechazo inalcanzable. */
class PokemonTeamAuctionEngineTest {

  private final PokemonTeamAuctionEngine engine =
      new PokemonTeamAuctionEngine(GoldenManifests.of(PokemonTeamAuctionEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-team-auction", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonTeamAuctionEngine(other));
  }

  @Test
  void parsesIntegralDoublesAndTheBidSecondsDefault() throws IOException {
    var config = engine.parseConfig(
        json("{\"generations\":[2,1],\"bidSeconds\":30.0,\"initialBudget\":10.0,\"includeForms\":false}"));
    assertEquals(new PokemonTeamAuctionConfig(List.of(1, 2), 30, 10, false), config);
    var defaulted = engine.parseConfig(json("{\"generations\":[1],\"initialBudget\":5,\"includeForms\":true}"));
    assertEquals(20, defaulted.bidSeconds());
    assertThrows(ConfigValidationException.class, () -> engine.parseConfig(
        json("{\"generations\":[1],\"bidSeconds\":null,\"initialBudget\":5,\"includeForms\":true}")));
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var raise = engine.parseAction(json("{\"type\":\"RAISE_BID\",\"amount\":5.0}"));
    assertEquals(5, assertInstanceOf(PokemonTeamAuctionAction.RaiseBid.class, raise).amount());
    var limit = engine.parseAction(json("{\"type\":\"RAISE_BID\",\"amount\":100000}"));
    assertEquals(100_000, assertInstanceOf(PokemonTeamAuctionAction.RaiseBid.class, limit).amount());
    assertInstanceOf(PokemonTeamAuctionAction.PassBid.class, engine.parseAction(json("{\"type\":\"PASS_BID\"}")));
    for (var invalid : List.of("{\"type\":\"RAISE_BID\",\"amount\":0}", "{\"type\":\"RAISE_BID\",\"amount\":100001}",
        "{\"type\":\"RAISE_BID\",\"amount\":1.5}", "{\"type\":\"RAISE_BID\",\"amount\":\"5\"}",
        "{\"type\":\"RAISE_BID\"}", "{\"type\":\"RAISE_BID\",\"amount\":5,\"extra\":1}",
        "{\"type\":\"PASS_BID\",\"amount\":5}", "{\"type\":\"raise_bid\",\"amount\":5}", "{\"type\":\"pass_bid\"}",
        "{\"amount\":5}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsAPool() {
    var emptyPool = new PokemonTeamAuctionConfig(List.of(9), 20, 20, false);
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(2)));
    assertEquals("No hay Pokémon disponibles con estas generaciones.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(2);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before the auction finishes", error.getMessage());
  }

  /** {@code normalizeTurn} nunca deja el turno a un equipo completo: solo se alcanza con un estado construido. */
  @Test
  void rejectsABidFromAFullTeam() {
    var context = context(2);
    var started = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var turnPlayerId = started.turnOrder().get(started.turnIndex());
    var lot = started.lots().getFirst();
    var participants = new LinkedHashMap<>(started.participants());
    participants.put(turnPlayerId,
        new TeamAuctionParticipant(20, List.of(lot, lot, lot, lot, lot, lot), turnPlayerId));
    var full = started.toBuilder().participants(participants).build();
    var result = engine.handleAction(full, turnPlayerId, new PokemonTeamAuctionAction.RaiseBid(1), context);
    assertFalse(result.accepted());
    assertEquals("Tu equipo ya está completo.", result.error());
    assertSame(full, result.state());
  }
}
