package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.Test;

class GuessingRoundTest {

  /** Como las estadísticas de guess-from-stats: los siete contadores comunes más {@code missed}. */
  private record Stats(int correct, int missed, int totalAttempts, int firstTry, int roundFirsts, long solveTimeTotalMs,
      long bestTimeMs, int pointsFromRounds) implements GuessSolveStats<Stats> {

    @Override
    public Stats withSolve(int correct, int totalAttempts, int firstTry, int roundFirsts, long solveTimeTotalMs,
        long bestTimeMs, int pointsFromRounds) {
      return new Stats(correct, missed, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs, bestTimeMs,
          pointsFromRounds);
    }
  }

  @Test
  void recordsSolveAccountingAndKeepsGameFields() {
    var first = GuessingRound.recordGuessSolve(new Stats(0, 2, 0, 0, 0, 0, 0, 0), 1, 1, 4_000, 10);
    assertEquals(new Stats(1, 2, 1, 1, 1, 4_000, 4_000, 10), first);
    var second = GuessingRound.recordGuessSolve(first, 3, 2, 6_000, 5);
    assertEquals(new Stats(2, 2, 2, 1, 1, 10_000, 4_000, 15), second);
    assertEquals(2_000, GuessingRound.recordGuessSolve(second, 1, 1, 2_000, 0).bestTimeMs());
  }

  @Test
  void guideSeesEveryAttemptOnlyWhenTheyAreNotPublic() {
    var attempts = List.of("a", "b");
    assertEquals(attempts, GuessingRound.guideAttempts(false, attempts));
    assertNull(GuessingRound.guideAttempts(true, attempts));
  }

  private record Attempt(String playerId, String pokemonId) {}

  private static final List<Attempt> ATTEMPTS = List.of(new Attempt("p1", "pidgey"), new Attempt("p2", "rattata"),
      new Attempt("p1", "zubat"));

  /** Con los intentos públicos, la vista pública los lleva todos; si no, ninguno. */
  @Test
  void publicAttemptsAreAllOrNothing() {
    assertEquals(ATTEMPTS, GuessingRound.publicAttempts(true, ATTEMPTS));
    assertEquals(List.of(), GuessingRound.publicAttempts(false, ATTEMPTS));
  }

  /** Sin intentos públicos, cada jugador recibe solo los suyos, en orden; con ellos, la vista propia no los repite. */
  @Test
  void ownAttemptsFilterOutEveryoneElse() {
    assertEquals(List.of(ATTEMPTS.get(0), ATTEMPTS.get(2)),
        GuessingRound.ownAttempts(false, ATTEMPTS, Attempt::playerId, "p1"));
    assertEquals(List.of(ATTEMPTS.get(1)), GuessingRound.ownAttempts(false, ATTEMPTS, Attempt::playerId, "p2"));
    assertEquals(List.of(), GuessingRound.ownAttempts(false, ATTEMPTS, Attempt::playerId, "p3"));
    assertNull(GuessingRound.ownAttempts(true, ATTEMPTS, Attempt::playerId, "p1"));
  }

  /** El mínimo de un estado de adivinar; {@code p1} ya ha acertado y {@code p2} está en cooldown hasta 5_000. */
  private record Round(GamePhase phase, List<String> playerIds, Map<String, Integer> solves,
      Map<String, Long> cooldownUntil, @Nullable Long roundEndsAt, @Nullable Long nextTransitionAt)
      implements GuessingState {

    static Round active(@Nullable Long roundEndsAt) {
      return new Round(GamePhase.ROUND_ACTIVE, List.of("p1", "p2", "p3"), Map.of("p1", 1), Map.of("p2", 5_000L),
          roundEndsAt, null);
    }
  }

  private static GameContext context(long now, GamePlayer... players) {
    return GameContext.builder(new InMemoryPokemonCatalog(List.of()), () -> 0.5).players(List.of(players)).now(now)
        .build();
  }

  private static final GamePlayer[] EVERYONE = {new GamePlayer("p1", "Uno"), new GamePlayer("p2", "Dos"),
      new GamePlayer("p3", "Tres")};

  private static final UnaryOperator<Round> FAIL_IF_EXPIRED = round -> {
    throw new AssertionError("onExpired solo se evalúa al vencer el plazo");
  };

  private static String rejection(Round round, String playerId, GameContext context) {
    var result = GuessingRound.precheck(round, playerId, context, "Ya acertado.", FAIL_IF_EXPIRED);
    assertFalse(result == null || result.accepted());
    assertSame(round, result.state());
    return result.error();
  }

  /** Las guardas van en orden: ronda activa, observador, acierto previo, plazo y cooldown. */
  @Test
  void precheckRejectsInOrder() {
    var round = Round.active(10_000L);
    var finished = new Round(GamePhase.ROUND_RESULTS, round.playerIds(), round.solves(), round.cooldownUntil(),
        null, null);
    assertEquals("No hay una ronda activa.", rejection(finished, "p1", context(1_000, EVERYONE)));
    // p1 ya acertó, pero desconectado es un observador.
    var p1Away = context(1_000, new GamePlayer("p1", "Uno", false, null), EVERYONE[1], EVERYONE[2]);
    assertEquals("Estás observando esta ronda.", rejection(round, "p1", p1Away));
    assertEquals("Estás observando esta ronda.", rejection(round, "intruso", context(1_000, EVERYONE)));
    assertEquals("Ya acertado.", rejection(round, "p1", context(1_000, EVERYONE)));
    assertEquals("Espera 4s antes de volver a intentar.", rejection(round, "p2", context(1_000, EVERYONE)));
    assertNull(GuessingRound.precheck(round, "p2", context(5_000, EVERYONE), "Ya acertado.", FAIL_IF_EXPIRED));
    assertNull(GuessingRound.precheck(round, "p3", context(1_000, EVERYONE), "Ya acertado.", FAIL_IF_EXPIRED));
  }

  /** Al vencer el plazo (o sin plazo) se rechaza con el estado de {@code onExpired}, antes que el cooldown. */
  @Test
  void precheckRejectsLateGuessesWithTheExpiredState() {
    var resolved = new Round(GamePhase.ROUND_RESULTS, List.of(), Map.of(), Map.of(), null, 20_000L);
    var calls = new AtomicInteger();
    UnaryOperator<Round> onExpired = round -> {
      calls.incrementAndGet();
      return resolved;
    };
    for (var round : List.of(Round.active(1_000L), Round.active(null))) {
      var result = GuessingRound.precheck(round, "p2", context(1_000, EVERYONE), "Ya acertado.", onExpired);
      assertFalse(result == null || result.accepted());
      assertEquals("El tiempo ha terminado.", result.error());
      assertSame(resolved, result.state());
    }
    assertEquals(2, calls.get());
  }
}
