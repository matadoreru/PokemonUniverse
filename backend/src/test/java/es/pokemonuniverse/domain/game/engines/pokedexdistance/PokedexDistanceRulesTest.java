package es.pokemonuniverse.domain.game.engines.pokedexdistance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.DistanceRoundRecord;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.EliminationReason;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.EliminationRecord;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PlayerRoundStats;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceState;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.RoundSelection;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Casos puros de {@code pokedex-distance/server.test.ts} más comprobaciones cruzadas con el TS sobre {@code gen1-2}. */
class PokedexDistanceRulesTest {

  private static PokedexDistanceState.Builder finished() {
    return PokedexDistanceState.builder().phase(GamePhase.GAME_RESULTS).config(PokedexDistanceConfig.defaults());
  }

  private static RoundSelection selection(String id, int dex, int distance) {
    return new RoundSelection(id, dex, distance, 1);
  }

  @Test
  void calculatesAbsoluteDistanceAndDetectsExactHits() {
    assertEquals(3, PokedexDistanceRules.distanceBetween(445, 448));
    assertEquals(0, PokedexDistanceRules.distanceBetween(448, 448));
    assertEquals(3, PokedexDistanceRules.distanceBetween(451, 448));
  }

  @Test
  void findsOneOrSeveralFarthestPlayersInInsertionOrder() {
    var single = new LinkedHashMap<String, RoundSelection>();
    single.put("a", selection("a", 1, 8));
    single.put("b", selection("b", 2, 3));
    assertEquals(List.of("a"), PokedexDistanceRules.farthestPlayerIds(single));
    var tied = new LinkedHashMap<String, RoundSelection>();
    tied.put("b", selection("b", 2, 8));
    tied.put("c", selection("c", 3, 1));
    tied.put("a", selection("a", 1, 8));
    assertEquals(List.of("b", "a"), PokedexDistanceRules.farthestPlayerIds(tied));
    assertEquals(List.of(), PokedexDistanceRules.farthestPlayerIds(Map.of()));
  }

  @Test
  void eliminationCountsSurvivorsBeforeRemovingThePlayers() {
    var state = finished().roundNumber(3).survivorIds(List.of("p1", "p2", "p3", "p4")).build();
    assertEquals(new EliminationRecord(List.of("p2", "p4"), EliminationReason.NO_RESPONSE, 3, 2),
        PokedexDistanceRules.elimination(List.of("p2", "p4"), EliminationReason.NO_RESPONSE, state));
  }

  @Test
  void selectionStatsCountExactHitsButNotRoundsSurvived() {
    var stats = PokedexDistanceRules.emptyPlayerStats().afterSelection(0).afterSelection(7);
    assertEquals(new PlayerRoundStats(1, 7, 2, 0, 0), stats);
  }

  @Test
  void survivalOnlyAddsOneRoundSurvived() {
    var stats = PokedexDistanceRules.emptyPlayerStats().afterSelection(3).afterSurvival(false);
    assertEquals(new PlayerRoundStats(0, 3, 1, 1, 0), stats);
  }

  @Test
  void survivingATiebreakAlsoAddsATiebreakWon() {
    var stats = PokedexDistanceRules.emptyPlayerStats().afterSurvival(true).afterSurvival(false);
    assertEquals(new PlayerRoundStats(0, 0, 0, 2, 1), stats);
  }

  /** {@code roundRecord}: una distancia por elegible en su orden, {@code null} sin respuesta, aunque se elija en otro orden. */
  @Test
  void roundRecordFollowsEligibleOrderWithNullsForNonResponders() {
    var selections = new LinkedHashMap<String, RoundSelection>();
    selections.put("p3", new RoundSelection("mew", 151, 25, 2_000));
    selections.put("p1", new RoundSelection("bulbasaur", 1, 125, 3_000));
    var state = finished().phase(GamePhase.TIEBREAKER_ACTIVE).roundNumber(2).tiebreakDepth(1).targetDexNumber(126)
        .eligibleIds(List.of("p1", "p2", "p3")).selections(selections).build();
    var record = PokedexDistanceRules.roundRecord(state, List.of("p2"));
    var distances = new LinkedHashMap<String, Integer>();
    distances.put("p1", 125);
    distances.put("p2", null);
    distances.put("p3", 25);
    assertEquals(new DistanceRoundRecord(2, 1, 126, distances, List.of("p2")), record);
    assertEquals(List.of("p1", "p2", "p3"), List.copyOf(record.distances().keySet()));
  }

  @Test
  void resultsAreUnavailableBeforeTheGameFinishes() {
    var state = finished().phase(GamePhase.ROUND_RESULTS).build();
    var error = assertThrows(EngineException.class, () -> PokedexDistanceRules.buildResults(state));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  /**
   * Valores fijados con {@code pokedexDistanceGame.getResults} de TS sobre el mismo estado ({@code npx tsx}, ver el
   * informe de la tarea 5): eliminaciones compartidas, desempate por id, {@code averageDistance} con
   * {@code Math.round} hacia arriba en .5 (1/8 → 0.13) y {@code won} ausente.
   */
  @Test
  void buildsSurvivalPositionsLikeTypeScript() {
    var stats = new LinkedHashMap<String, PlayerRoundStats>();
    stats.put("p4", PlayerRoundStats.ZERO);
    stats.put("p2", new PlayerRoundStats(1, 1, 8, 8, 2));
    stats.put("p1", new PlayerRoundStats(0, 5, 3, 3, 0));
    stats.put("p3", new PlayerRoundStats(2, 2, 3, 3, 1));
    var state = finished()
        .initialPlayerIds(List.of("p4", "p2", "p1", "p3"))
        .winnerId("p2")
        .eliminations(List.of(
            new EliminationRecord(List.of("p4"), EliminationReason.NO_RESPONSE, 1, 3),
            new EliminationRecord(List.of("p3", "p1"), EliminationReason.NO_RESPONSE, 2, 1)))
        .playerStats(stats)
        .build();
    var results = PokedexDistanceRules.buildResults(state);
    assertEquals("p2", results.winnerId());
    assertEquals(List.of(
        standing("p2", 1, 8, 1, 8, 8, 0.13, 2),
        standing("p1", 2, 5, 0, 3, 3, 1.67, 0),
        standing("p3", 2, 5, 2, 3, 3, 0.67, 1),
        standing("p4", 4, 1, 0, 0, 0, 0, 0)), results.standings());
  }

  /** {@code finishes safely without a winner when every remaining player times out}: nadie puntúa. */
  @Test
  void withoutAWinnerTheSharedFirstPlaceScoresZero() {
    var state = finished()
        .initialPlayerIds(List.of("p1", "p2"))
        .eliminations(List.of(new EliminationRecord(List.of("p1", "p2"), EliminationReason.NO_RESPONSE, 1, 0)))
        .playerStats(Map.of("p1", PlayerRoundStats.ZERO, "p2", PlayerRoundStats.ZERO))
        .build();
    var results = PokedexDistanceRules.buildResults(state);
    assertNull(results.winnerId());
    assertEquals(List.of(1, 1), results.standings().stream().map(GameStanding::position).toList());
    assertEquals(List.of(0, 0), results.standings().stream().map(GameStanding::points).toList());
  }

  /**
   * Objetivo de la primera ronda según {@code pokedexDistanceGame.start} de TS ({@code npx tsx} sobre {@code dist},
   * {@code golden/prng.ts} y {@code golden/catalog.ts}) y el {@code random()} siguiente: una sola extracción.
   */
  @Test
  void selectsTheFirstTargetLikeTypeScript() {
    var catalog = GoldenCatalogs.load("gen1-2");
    record Case(int seed, List<Integer> generations, int target, double next) {}
    for (var c : List.of(new Case(101, List.of(1, 2), 35, 0.764801949961111),
        new Case(404, List.of(1), 54, 0.8971698426175863), new Case(7, List.of(2), 153, 0.06195825757458806))) {
      var random = new Mulberry32(c.seed());
      var target = Randoms.randomItem(catalog.forGenerations(c.generations()), random).nationalDexNumber();
      assertEquals(c.target(), target, "seed " + c.seed());
      assertEquals(c.next(), random.getAsDouble(), "seed " + c.seed());
    }
  }

  private static GameStanding standing(String playerId, int position, int points, int exactHits, int roundsSurvived,
      int selections, double averageDistance, int tiebreaksWon) {
    var stats = new LinkedHashMap<String, Number>();
    stats.put("exactHits", exactHits);
    stats.put("roundsSurvived", roundsSurvived);
    stats.put("selections", selections);
    stats.put("averageDistance", averageDistance); // el ternario de Java promociona el 0 de TS a 0.0 (mismo JSON)
    stats.put("tiebreaksWon", tiebreaksWon);
    return new GameStanding(playerId, position, points, null, stats);
  }
}
