package es.pokemonuniverse.domain.achievements;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Parte derivada de {@link AchievementFacts}, sin base de datos. */
class AchievementFactsTest {

  private static final GameStanding P1 = new GameStanding("p1", 1, 10, null, Map.of("exactHits", 2));
  private static final GameStanding P2 = new GameStanding("p2", 2, 0, null, Map.of());

  private static AchievementFacts facts(String gameId, String mode, int xp, GameResults results) {
    return AchievementFacts.of(gameId, mode, results.standings().getFirst(), results, true, 1, 1, xp, Map.of(),
        1, Instant.parse("2026-11-06T02:30:00Z"));
  }

  @Test
  void nullModeIsClassic() {
    assertEquals("CLASSIC", facts("pokemon-trivia", null, 0, new GameResults("p1", List.of(P1))).mode());
    assertEquals("ENDLESS", facts("higher-lower", "ENDLESS", 0, new GameResults("p1", List.of(P1))).mode());
  }

  @Test
  void levelFromXp() {
    assertEquals(1, facts("pokemon-trivia", null, 0, new GameResults("p1", List.of(P1))).level());
    assertEquals(4, facts("pokemon-trivia", null, 699, new GameResults("p1", List.of(P1))).level());
    assertEquals(10, facts("pokemon-trivia", null, 2700, new GameResults("p1", List.of(P1))).level());
  }

  @Test
  void missingMetricIsZero() {
    var facts = facts("pokedex-distance", null, 0, new GameResults("p1", List.of(P1, P2)));
    assertEquals(2, facts.metric("exactHits"));
    assertEquals(0, facts.metric("noExiste"));
  }

  @Test
  void endedAtIsMadridTime() {
    var facts = facts("pokemon-trivia", null, 0, new GameResults("p1", List.of(P1)));
    assertEquals(ZoneId.of("Europe/Madrid"), facts.endedAt().getZone());
    assertEquals(3, facts.endedAt().getHour());
  }

  @Test
  void derivedRanking() {
    var facts = facts("pokemon-trivia", null, 0, new GameResults("p1", List.of(P1, P2)));
    assertEquals(2, facts.playerCount());
    assertFalse(facts.sharedFirst());
    assertFalse(facts.lastPlace());
    assertTrue(facts.individualRanking());

    var last = AchievementFacts.of("pokemon-trivia", null, P2, new GameResults("p1", List.of(P1, P2)), false, 1, 0,
        0, Map.of(), 1, Instant.EPOCH);
    assertTrue(last.lastPlace());

    var tied = new GameStanding("p2", 1, 10, null, Map.of());
    assertTrue(facts("pokemon-trivia", null, 0, new GameResults(null, List.of(P1, tied))).sharedFirst());

    assertFalse(facts("pokemon-impostor", null, 0, new GameResults(null, List.of(P1, P2))).individualRanking());
    assertFalse(facts("type-duel", "COOP", 0, GameResults.unranked(List.of(P1, P2))).individualRanking());
    assertTrue(facts("type-duel", "CLASSIC", 0, new GameResults("p1", List.of(P1, P2))).individualRanking());
  }
}
