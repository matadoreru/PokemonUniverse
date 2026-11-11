package es.pokemonuniverse.domain.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.Scoring.ScoreEntry;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ScoringTest {

  private record Entry(String id, int score) {}

  @Test
  void pointsForPositionUsesFieldSizeAndPodiumMultiplier() {
    assertEquals(8, Scoring.pointsForPosition(4, 1));
    assertEquals(5, Scoring.pointsForPosition(4, 2));
    assertEquals(3, Scoring.pointsForPosition(4, 3));
    assertEquals(1, Scoring.pointsForPosition(4, 4));
    var error = assertThrows(IllegalArgumentException.class, () -> Scoring.pointsForPosition(4, 5));
    assertEquals("Invalid player count or position", error.getMessage());
    assertThrows(IllegalArgumentException.class, () -> Scoring.pointsForPosition(0, 1));
    assertThrows(IllegalArgumentException.class, () -> Scoring.pointsForPosition(3, 0));
  }

  @Test
  void usesCompetitionPositionsAndAGameProvidedTieKey() {
    var ranked = Scoring.rankCompetition(
        List.of(new Entry("c", 5), new Entry("a", 10), new Entry("b", 5), new Entry("d", 1)),
        Comparator.comparingInt((Entry e) -> -e.score()).thenComparing(Entry::id),
        Entry::score);
    assertEquals(List.of("a=1", "b=2", "c=2", "d=4"),
        ranked.stream().map(r -> r.entry().id() + "=" + r.position()).toList());
  }

  @Test
  void returnsNoUniqueWinnerWhenFirstPlaceIsTied() {
    List<ScoreEntry<Map<String, Number>>> entries = List.of(
        new ScoreEntry<>("a", 5, Map.of("correct", 2)), new ScoreEntry<>("b", 5, Map.of("correct", 2)));
    var results = Scoring.buildRankedResults(entries,
        Comparator.comparingInt((ScoreEntry<Map<String, Number>> e) -> -e.points()).thenComparing(ScoreEntry::playerId),
        ScoreEntry::points);
    assertNull(results.winnerId());
    assertTrue(results.standings().stream().allMatch(s -> Boolean.TRUE.equals(s.won())));
    assertEquals(Map.of("correct", 2), results.standings().get(0).stats());
  }

  @Test
  void mapsStatsWithTheGameProjection() {
    record Stats(int correct) {}
    var results = Scoring.buildRankedResults(
        List.of(new ScoreEntry<>("a", 3, new Stats(1)), new ScoreEntry<>("b", 9, new Stats(4))),
        Comparator.comparingInt((ScoreEntry<Stats> e) -> -e.points()),
        ScoreEntry::points,
        e -> Map.of("correct", e.stats().correct()));
    assertEquals("b", results.winnerId());
    assertEquals(List.of(new GameStanding("b", 1, 9, true, Map.of("correct", 4)),
        new GameStanding("a", 2, 3, false, Map.of("correct", 1))), results.standings());
  }

  private static GameResults scaled(int scale) {
    return new GameResults("a", List.of(
        new GameStanding("a", 1, 10 * scale, null, Map.of()),
        new GameStanding("b", 2, 5 * scale, null, Map.of()),
        new GameStanding("c", 3, 0, null, Map.of())));
  }

  @Test
  void normalizesSessionAwardsIndependentlyOfEachGameScoreScale() {
    assertEquals(Map.of("a", 6, "b", 3, "c", 0), Scoring.sessionPointsForResults(scaled(1)));
    assertEquals(Scoring.sessionPointsForResults(scaled(1)), Scoring.sessionPointsForResults(scaled(1_000)));
    assertEquals(List.of("a", "b", "c"), List.copyOf(Scoring.sessionPointsForResults(scaled(1)).keySet()));
    assertEquals("POSITION_V1", Scoring.SESSION_SCORING_VERSION);
  }

  @Test
  void givesEqualSessionAwardsToTiedStandingsAndNoneToAZeroScoreGame() {
    assertEquals(Map.of("a", 4, "b", 4), Scoring.sessionPointsForResults(new GameResults(null, List.of(
        new GameStanding("a", 1, 5, null, Map.of()), new GameStanding("b", 1, 5, null, Map.of())))));
    assertEquals(Map.of("a", 0, "b", 0), Scoring.sessionPointsForResults(new GameResults(null, List.of(
        new GameStanding("a", 1, 0, null, Map.of()), new GameStanding("b", 1, 0, null, Map.of())))));
  }

  @Test
  void requireFinishedThrowsTheGameMessageOutsideGameResults() {
    Scoring.requireFinished(GamePhase.GAME_RESULTS, "x");
    var error = assertThrows(EngineException.class, () -> Scoring.requireFinished(GamePhase.ROUND_RESULTS, "Antes"));
    assertEquals("Antes", error.getMessage());
  }

  @Test
  void scoreEntriesKeepThePlayerOrderAndDefaultMissingScoresToZero() {
    var entries = Scoring.scoreEntries(List.of("b", "a"), Map.of("a", 3), id -> id + "-stats");
    assertEquals(List.of(new ScoreEntry<>("b", 0, "b-stats"), new ScoreEntry<>("a", 3, "a-stats")), entries);
  }
}
