package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TimingTest {

  private record State(GamePhase phase, Long roundEndsAt, Long nextTransitionAt, int rounds) implements TimedGameState {}

  private static final TimedRoundStrategy<State> STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public State resolveActive(State s, GameContext c) {
      return new State(GamePhase.ROUND_RESULTS, null, 120L, s.rounds());
    }

    @Override
    public State beginNext(State s, GameContext c) {
      return new State(GamePhase.ROUND_ACTIVE, 200L, null, s.rounds() + 1);
    }

    @Override
    public State finish(State s, GameContext c) {
      return new State(GamePhase.GAME_RESULTS, null, null, s.rounds());
    }

    @Override
    public boolean isComplete(State s) {
      return s.rounds() >= 2;
    }
  };

  private static GameContext context(long now, List<GamePlayer> players) {
    return GameContext.builder(new InMemoryPokemonCatalog(List.of()), () -> 0).players(players).now(now).build();
  }

  @Test
  void handlesNullableDeadlinesAndCooldownMapsConsistently() {
    assertFalse(Timing.deadlineReached(10, null));
    assertTrue(Timing.deadlineReached(10, 10L));
    assertFalse(Timing.deadlineReached(9, 10L));
    assertTrue(Timing.deadlinePassedOrMissing(10, null));
    assertTrue(Timing.deadlinePassedOrMissing(0, null));
    assertTrue(Timing.deadlinePassedOrMissing(10, 10L));
    assertFalse(Timing.deadlinePassedOrMissing(9, 10L));
    assertEquals(750, Timing.cooldownRemainingMs(1_250, 2_000L));
    assertEquals(0, Timing.cooldownRemainingMs(1_250, null));
    assertEquals("Espera 0.8s antes de volver a intentar.", Timing.cooldownMessage(1_250, 2_000L));
    var cooldowns = new LinkedHashMap<String, Long>();
    cooldowns.put("other", 1L);
    var updated = Timing.setPlayerCooldown(cooldowns, "player", 1_000, 500);
    assertEquals(Map.of("other", 1L, "player", 1_500L), updated);
    assertEquals(List.of("other", "player"), List.copyOf(updated.keySet()));
    assertEquals(Map.of("other", 1L), cooldowns);
  }

  @Test
  void cooldownMessageFormatsSecondsLikeJs() {
    assertEquals("Espera 0.1s antes de volver a intentar.", Timing.cooldownMessage(0, 1L));
    assertEquals("Espera 1s antes de volver a intentar.", Timing.cooldownMessage(0, 1_000L));
    assertEquals("Espera 1.5s antes de volver a intentar.", Timing.cooldownMessage(0, 1_450L));
    assertEquals("Espera 2s antes de volver a intentar.", Timing.cooldownMessage(0, 2_000L));
    assertEquals("Espera 0s antes de volver a intentar.", Timing.cooldownMessage(5, 1L));
  }

  @Test
  void delegatesLifecycleTransitionsToTheSuppliedStrategy() {
    var context = context(100, List.of());
    var revealed = Timing.advanceTimedRound(new State(GamePhase.ROUND_ACTIVE, 100L, null, 1), context, STRATEGY);
    assertEquals(GamePhase.ROUND_RESULTS, revealed.phase());
    var next = Timing.advanceTimedRound(new State(GamePhase.ROUND_RESULTS, null, 100L, 1), context, STRATEGY);
    assertEquals(new State(GamePhase.ROUND_ACTIVE, 200L, null, 2), next);
    var done = Timing.advanceTimedRound(new State(GamePhase.ROUND_RESULTS, null, 100L, 2), context, STRATEGY);
    assertEquals(GamePhase.GAME_RESULTS, done.phase());
    var waiting = new State(GamePhase.ROUND_ACTIVE, 101L, null, 1);
    assertSame(waiting, Timing.advanceTimedRound(waiting, context, STRATEGY));
    var other = new State(GamePhase.VOTING, 1L, 1L, 1);
    assertSame(other, Timing.advanceTimedRound(other, context, STRATEGY));
  }

  @Test
  void contextRequiresCatalogAndRandom() {
    var catalog = new InMemoryPokemonCatalog(List.of());
    var noCatalog = assertThrows(NullPointerException.class, () -> GameContext.builder(null, () -> 0));
    assertEquals("GameContext necesita un catálogo de Pokémon (pokemon)", noCatalog.getMessage());
    var noRandom = assertThrows(NullPointerException.class, () -> GameContext.builder(catalog, null));
    assertEquals("GameContext necesita una fuente de azar (random)", noRandom.getMessage());
    var context = context(5, List.of());
    assertFalse(context.isHost("x"));
    assertFalse(context.toBuilder().hostId("").build().isHost(""));
    assertTrue(context.toBuilder().hostId("x").build().isHost("x"));
    assertFalse(context.toBuilder().hostId("x").build().isHost("y"));
    assertEquals(9, context.withNow(9).now());
    assertEquals(List.of("x"), context.withPlayers(List.of(new GamePlayer("x", "X"))).players().stream()
        .map(GamePlayer::id).toList());
  }

  @Test
  void resolvesOnlyWhenEveryConnectedRequiredPlayerCompleted() {
    var players = List.of(new GamePlayer("a", "A", null, null), new GamePlayer("b", "B", false, null),
        new GamePlayer("c", "C", true, false));
    var context = context(0, players);
    var active = new State(GamePhase.ROUND_ACTIVE, 500L, null, 1);
    var resolved = Timing.resolveWhenRequiredPlayersComplete(active, context, List.of("a", "b", "c"), "a"::equals,
        STRATEGY::resolveActive);
    assertEquals(GamePhase.ROUND_RESULTS, resolved.phase());
    assertSame(active, Timing.resolveWhenRequiredPlayersComplete(active, context, List.of("a", "b"), id -> false,
        STRATEGY::resolveActive));
    assertSame(active, Timing.resolveWhenRequiredPlayersComplete(active, context, List.of("a"), id -> true,
        STRATEGY::resolveActive, GamePhase.VOTING));
  }
}
