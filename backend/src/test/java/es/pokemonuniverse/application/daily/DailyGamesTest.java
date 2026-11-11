package es.pokemonuniverse.application.daily;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.daily.DailyOutcome;
import es.pokemonuniverse.domain.daily.DailySeed;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerCategory;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerEngine;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerMode;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerChoice;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerOutcome;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerPokemonView;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerPublicState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerRoundResult;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessEngine;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessMode;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessPublicState;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessSolve;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetRoundPokemon;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetRoundResult;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceEngine;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceMode;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.DistanceRoundRecord;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistancePublicState;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig.VoteVisibility;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteEngine;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteMode;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyOptionId;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyRoundResult;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVote;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVotePublicState;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.golden.WebContracts;
import io.micronaut.json.tree.JsonNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

class DailyGamesTest {

  private static final byte[] KEY = "k".repeat(32).getBytes(StandardCharsets.UTF_8);
  private static final String P = "p1";

  private static DailyGame game(String id) {
    return DailyGames.byId(id).orElseThrow();
  }

  @Test
  void allKeepsTheContractOrder() {
    assertEquals(List.of("pokedex-distance", "shiny-vote", "higher-lower", "learnset-guess"),
        DailyGames.all().stream().map(DailyGame::gameId).toList());
    assertEquals(List.of(5, 10, 10, 3), DailyGames.all().stream().map(DailyGame::roundCount).toList());
  }

  @Test
  void byIdFindsOnlyTheFourGames() {
    assertEquals("higher-lower", game("higher-lower").gameId());
    assertTrue(DailyGames.byId("type-chain").isEmpty());
    assertTrue(DailyGames.byId(null).isEmpty());
  }

  @Test
  void gameOfTheDayIsDeterministicPerDate() {
    var date = LocalDate.parse("2026-11-07");
    long seed = DailySeed.seed(KEY, date);
    // El vector fijo de DailySeedTest: 0xf4e11015 % 4 = 1.
    assertEquals(4_108_390_421L, seed);
    assertEquals("shiny-vote", DailyGames.ofTheDay(seed).gameId());
    for (int attempt = 0; attempt < 5; attempt++) {
      assertEquals("shiny-vote", DailyGames.ofTheDay(DailySeed.seed(KEY, date)).gameId());
    }
    assertEquals("pokedex-distance", DailyGames.ofTheDay(0).gameId());
    assertEquals("learnset-guess", DailyGames.ofTheDay((1L << 32) - 1).gameId());
  }

  @Test
  void gameOfTheDayIsRoughlyUniform() {
    var counts = new HashMap<String, Integer>();
    var start = LocalDate.parse("2026-01-01");
    int days = 4000;
    for (int day = 0; day < days; day++) {
      counts.merge(DailyGames.ofTheDay(DailySeed.seed(KEY, start.plusDays(day))).gameId(), 1, Integer::sum);
    }
    for (var game : DailyGames.all()) {
      int count = counts.getOrDefault(game.gameId(), 0);
      assertTrue(count >= days * 0.20 && count <= days * 0.30, game.gameId() + " salió " + count + " días");
    }
  }

  @Test
  void pokedexDistanceConfigPassesTheEngine() {
    var engine = new PokedexDistanceEngine(GoldenManifests.of(PokedexDistanceEngine.ID));
    var config = engine.parseConfig(game(PokedexDistanceEngine.ID).config(GoldenReplayer.tree(engine.defaultConfig())));
    assertEquals(PokedexDistanceMode.POINTS, config.mode());
    assertEquals(5, config.pointsRounds());
    assertEquals(engine.defaultConfig().generations(), config.generations());
    assertEquals(engine.defaultConfig().roundSeconds(), config.roundSeconds());
  }

  @Test
  void higherLowerConfigPassesTheEngine() {
    var engine = new HigherLowerEngine(GoldenManifests.of(HigherLowerEngine.ID));
    var config = engine.parseConfig(game(HigherLowerEngine.ID).config(GoldenReplayer.tree(engine.defaultConfig())));
    assertEquals(HigherLowerMode.CLASSIC, config.mode());
    assertEquals(10, config.rounds());
    assertEquals(engine.defaultConfig().categories(), config.categories());
  }

  @Test
  void shinyVoteConfigPassesTheEngine() {
    var engine = new ShinyVoteEngine(GoldenManifests.of(ShinyVoteEngine.ID));
    var config = engine.parseConfig(game(ShinyVoteEngine.ID).config(GoldenReplayer.tree(engine.defaultConfig())));
    assertEquals(ShinyVoteMode.CLASSIC, config.mode());
    assertEquals(10, config.rounds());
    assertEquals(4, config.optionCount());
    assertEquals(VoteVisibility.REVEAL, config.voteVisibility());
  }

  @Test
  void learnsetGuessConfigPassesTheEngine() {
    var engine = new LearnsetGuessEngine(GoldenManifests.of(LearnsetGuessEngine.ID));
    var config = engine.parseConfig(game(LearnsetGuessEngine.ID).config(GoldenReplayer.tree(engine.defaultConfig())));
    assertEquals(LearnsetGuessMode.MANUAL_REVEAL, config.mode());
    assertEquals(3, config.rounds());
    assertEquals(90, config.roundSeconds());
    assertEquals(engine.defaultConfig().generations(), config.generations());
  }

  // --- Pokédex Distance: solo GAME_RESULTS, con roundHistory sin desempates.

  private static PokedexDistancePublicState distance(GamePhase phase, List<DistanceRoundRecord> history) {
    return new PokedexDistancePublicState("pokedex-distance", phase, PokedexDistanceMode.POINTS, 3, 0, null, List.of(),
        List.of(P), List.of(), Map.of(), List.of(), List.of(), null, null, null, history, null, null, null, 3, 5,
        Map.of(P, 0));
  }

  private static DistanceRoundRecord record(int round, int depth, Integer distance) {
    var distances = new LinkedHashMap<String, Integer>();
    distances.put(P, distance);
    return new DistanceRoundRecord(round, depth, 25, distances, List.of());
  }

  @Test
  void distanceReadsRoundHistoryAtGameResults() {
    var game = game("pokedex-distance");
    var outcomes = new TreeMap<Integer, Integer>();
    var history = List.of(record(1, 0, 0), record(2, 0, 7), record(3, 0, null), record(3, 1, 2));
    game.observe(distance(GamePhase.ROUND_RESULTS, history), P, outcomes);
    assertTrue(outcomes.isEmpty(), "antes de GAME_RESULTS no hay roundHistory que leer");
    game.observe(distance(GamePhase.GAME_RESULTS, history), P, outcomes);
    assertEquals(Map.of(1, 0, 2, 7, 3, -1), outcomes);
    assertEquals(-1, game.missingValue());
    assertEquals(1, game.correct(List.of(0, 7, -1, -1, -1)));
  }

  @Test
  void distanceIgnoresOtherGamesStates() {
    var outcomes = new TreeMap<Integer, Integer>();
    game("pokedex-distance").observe("otro estado", P, outcomes);
    assertTrue(outcomes.isEmpty());
  }

  // --- Higher or Lower: lastRound en ROUND_RESULTS o GAME_RESULTS, con el roundNumber público.

  private static HigherLowerPublicState higherLower(GamePhase phase, int round, HigherLowerOutcome outcome) {
    var view = new HigherLowerPokemonView("pikachu", "Pikachu", "/s", 1);
    var outcomes = outcome == null ? Map.<String, HigherLowerOutcome>of() : Map.of(P, outcome);
    var lastRound = phase == GamePhase.ROUND_ACTIVE ? null
        : new HigherLowerRoundResult(1, 2, HigherLowerChoice.HIGHER, outcomes);
    return new HigherLowerPublicState("higher-lower", phase, HigherLowerMode.CLASSIC, List.of(P), round, 10,
        HigherLowerCategory.HP, view, view, Map.of(), List.of(), Map.of(P, 0), Map.of(P, 0), null, null, null, null,
        lastRound, null);
  }

  private static HigherLowerOutcome hlOutcome(HigherLowerChoice choice, boolean correct) {
    return new HigherLowerOutcome(choice, correct, correct ? 1 : 0, 0, 0, correct ? 1 : 0, 0);
  }

  @Test
  void higherLowerHitMissNoAnswerAndLastRound() {
    var game = game("higher-lower");
    var outcomes = new TreeMap<Integer, Integer>();
    game.observe(higherLower(GamePhase.ROUND_ACTIVE, 1, null), P, outcomes);
    assertTrue(outcomes.isEmpty());
    game.observe(higherLower(GamePhase.ROUND_RESULTS, 1, hlOutcome(HigherLowerChoice.HIGHER, true)), P, outcomes);
    game.observe(higherLower(GamePhase.ROUND_RESULTS, 2, hlOutcome(HigherLowerChoice.LOWER, false)), P, outcomes);
    game.observe(higherLower(GamePhase.ROUND_RESULTS, 3, hlOutcome(null, false)), P, outcomes);
    game.observe(higherLower(GamePhase.ROUND_RESULTS, 4, null), P, outcomes);
    game.observe(higherLower(GamePhase.GAME_RESULTS, 10, hlOutcome(HigherLowerChoice.HIGHER, true)), P, outcomes);
    assertEquals(Map.of(1, 1, 2, 0, 3, -1, 4, -1, 10, 1), outcomes);
    assertEquals(-1, game.missingValue());
    assertEquals(2, game.correct(List.of(1, 0, -1, -1, 1)));
  }

  // --- Shiny Quiz: lastRound.roundNumber; acierto si está en correctPlayerIds, 0 si votó.

  private static ShinyVotePublicState shiny(GamePhase phase, int round, ShinyRoundResult lastRound) {
    return new ShinyVotePublicState("shiny-vote", phase, ShinyVoteMode.CLASSIC, round, 10, List.of(P), List.of(),
        Map.of(), List.of(), VoteVisibility.REVEAL, List.of(), Map.of(P, 0), null, null, null, null, lastRound, null,
        null, null, null);
  }

  private static ShinyRoundResult shinyRound(int round, ShinyOptionId vote, boolean correct) {
    var votes = vote == null ? Map.<String, ShinyVote>of() : Map.of(P, new ShinyVote(vote, 10));
    return new ShinyRoundResult(round, ShinyOptionId.A, votes, correct ? List.of(P) : List.of(),
        correct ? List.of() : List.of(P));
  }

  @Test
  void shinyHitMissNoVoteAndLastRound() {
    var game = game("shiny-vote");
    var outcomes = new TreeMap<Integer, Integer>();
    game.observe(shiny(GamePhase.ROUND_ACTIVE, 1, null), P, outcomes);
    assertTrue(outcomes.isEmpty());
    // La clave es lastRound.roundNumber, no el roundNumber público.
    game.observe(shiny(GamePhase.ROUND_RESULTS, 9, shinyRound(1, ShinyOptionId.A, true)), P, outcomes);
    game.observe(shiny(GamePhase.ROUND_RESULTS, 9, shinyRound(2, ShinyOptionId.B, false)), P, outcomes);
    game.observe(shiny(GamePhase.ROUND_RESULTS, 9, shinyRound(3, null, false)), P, outcomes);
    game.observe(shiny(GamePhase.GAME_RESULTS, 10, shinyRound(10, ShinyOptionId.A, true)), P, outcomes);
    assertEquals(Map.of(1, 1, 2, 0, 3, -1, 10, 1), outcomes);
    assertEquals(-1, game.missingValue());
    assertEquals(2, game.correct(List.of(1, 0, -1, 1)));
  }

  // --- Learnset Guess: grupos que veía al acertar (revealStage + 1) o 0.

  private static LearnsetGuessPublicState learnset(GamePhase phase, int round, LearnsetGuessSolve solve) {
    var solves = solve == null ? Map.<String, LearnsetGuessSolve>of() : Map.of(P, solve);
    var lastRound = phase == GamePhase.ROUND_ACTIVE ? null
        : new LearnsetRoundResult(new LearnsetRoundPokemon("bulbasaur", "Bulbasaur", "/s", 1, 1), 9, "SV", List.of(),
            List.of(), solves, List.of(), Map.of(P, 1), 5);
    return new LearnsetGuessPublicState("learnset-guess", phase, LearnsetGuessMode.MANUAL_REVEAL, round, 3, 9, "SV",
        List.of(), null, List.of(), List.of(), null, null, null, false, lastRound, Map.of(P, 0), null);
  }

  @Test
  void learnsetHitMissNoAnswerAndLastRound() {
    var game = game("learnset-guess");
    var outcomes = new TreeMap<Integer, Integer>();
    game.observe(learnset(GamePhase.ROUND_ACTIVE, 1, null), P, outcomes);
    assertTrue(outcomes.isEmpty());
    game.observe(learnset(GamePhase.ROUND_RESULTS, 1, new LearnsetGuessSolve(1, 10, 0, 50)), P, outcomes);
    game.observe(learnset(GamePhase.ROUND_RESULTS, 2, new LearnsetGuessSolve(1, 10, 3, 20)), P, outcomes);
    game.observe(learnset(GamePhase.GAME_RESULTS, 3, null), P, outcomes);
    assertEquals(Map.of(1, 1, 2, 4, 3, 0), outcomes);
    assertEquals(0, game.missingValue());
    assertEquals(2, game.correct(List.of(1, 4, 0)));
  }

  // --- Relleno de las rondas que faltan y puntuación.

  private static GameResults results(int points) {
    return new GameResults(P, List.of(new GameStanding("other", 2, 1, null, Map.of()),
        new GameStanding(P, 1, points, null, Map.of())));
  }

  @Test
  void outcomeFillsMissingRoundsAndTakesThePoints() {
    var outcomes = new TreeMap<Integer, Integer>(Map.of(1, 1, 3, 0));
    assertEquals(new DailyOutcome(42, 1, List.of(1, -1, 0, -1, -1, -1, -1, -1, -1, -1)),
        DailyGames.outcome(game("higher-lower"), outcomes, results(42), P));
    assertEquals(new DailyOutcome(42, 1, List.of(2, 0, 0)),
        DailyGames.outcome(game("learnset-guess"), new TreeMap<>(Map.of(1, 2)), results(42), P));
    assertEquals(new DailyOutcome(150, 1, List.of(0, 3, -1, -1, -1)),
        DailyGames.outcome(game("pokedex-distance"), new TreeMap<>(Map.of(1, 0, 2, 3)), results(150), P));
  }

  @Test
  void outcomeIgnoresRoundsOutsideTheChallengeAndScoresZeroWithoutStanding() {
    var outcomes = new TreeMap<Integer, Integer>(Map.of(0, 1, 2, 1, 11, 1));
    var outcome = DailyGames.outcome(game("shiny-vote"), outcomes, new GameResults(null, List.of()), P);
    assertEquals(new DailyOutcome(0, 1, List.of(-1, 1, -1, -1, -1, -1, -1, -1, -1, -1)), outcome);
  }

  /**
   * La web repite el orden de los juegos ({@code DAILY_GAME_IDS}) y la regla de cada uno ({@code DAILY_RULE_TEXT}):
   * graba {@code web-contracts/daily-games.json} (id, rondas y claves fijas de la configuración, en el orden del
   * sorteo), que lee {@code packages/shared/src/daily.test.ts}.
   */
  @Test
  void matchesTheWebContract() throws IOException {
    var games = new ArrayList<LinkedHashMap<String, Object>>();
    for (var game : DailyGames.all()) {
      // Sobre una configuración vacía quedan solo las claves fijas; ordenadas, porque llegan de un Map.of.
      var config = new TreeMap<String, JsonNode>();
      for (var key : game.config(JsonNode.createObjectNode(Map.of())).entries()) {
        config.put(key.getKey(), key.getValue());
      }
      var entry = new LinkedHashMap<String, Object>();
      entry.put("gameId", game.gameId());
      entry.put("roundCount", game.roundCount());
      entry.put("config", JsonNode.createObjectNode(config));
      games.add(entry);
    }
    WebContracts.check("daily-games.json", games);
  }
}
