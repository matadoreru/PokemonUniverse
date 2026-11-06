package es.pokemonuniverse.application.daily;

import es.pokemonuniverse.domain.daily.DailyOutcome;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerPublicState;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessPublicState;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistancePublicState;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVotePublicState;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.SortedMap;
import java.util.function.IntPredicate;

/**
 * Los cuatro minijuegos del sorteo del reto diario. El orden de {@link #all()} forma parte del contrato (el sorteo
 * indexa esta lista y {@code DAILY_GAME_IDS} de la web lo repite): reordenarla o añadir un juego cambia el juego de los
 * días que todavía no tienen fila en {@code DailyChallenge}.
 */
public final class DailyGames {

  private static final List<DailyGame> ALL = List.of(new PokedexDistance(), new ShinyVote(), new HigherLower(),
      new LearnsetGuess());

  private DailyGames() {}

  /** {@code pokedex-distance}, {@code shiny-vote}, {@code higher-lower} y {@code learnset-guess}, en ese orden. */
  public static List<DailyGame> all() {
    return ALL;
  }

  public static Optional<DailyGame> byId(@Nullable String gameId) {
    return ALL.stream().filter(game -> game.gameId().equals(gameId)).findFirst();
  }

  /** Juego del sorteo: exactamente uniforme sobre las semillas, porque {@code 2^32} es múltiplo de 4. */
  public static DailyGame ofTheDay(long seed) {
    return ALL.get((int) (seed % ALL.size()));
  }

  /**
   * Resultado de la partida: las rondas {@code 1..roundCount} en orden, con {@link DailyGame#missingValue()} en las
   * que no se observaron, y la puntuación de la clasificación del motor ({@code 0} si el jugador no figura).
   */
  public static DailyOutcome outcome(DailyGame game, SortedMap<Integer, Integer> outcomes, GameResults results,
      String playerId) {
    var rounds = new ArrayList<Integer>();
    for (int round = 1; round <= game.roundCount(); round++) {
      rounds.add(outcomes.getOrDefault(round, game.missingValue()));
    }
    int score = results.standings().stream()
        .filter(standing -> standing.playerId().equals(playerId))
        .mapToInt(GameStanding::points)
        .findFirst()
        .orElse(0);
    return new DailyOutcome(score, game.correct(rounds), rounds);
  }

  /** Copia de {@code defaultConfig} con {@code overrides} sustituidas (o añadidas), en el orden de las claves originales. */
  private static JsonNode withKeys(JsonNode defaultConfig, Map<String, JsonNode> overrides) {
    var values = new LinkedHashMap<String, JsonNode>();
    for (var entry : defaultConfig.entries()) values.put(entry.getKey(), entry.getValue());
    values.putAll(overrides);
    return JsonNode.createObjectNode(values);
  }

  private static boolean resultsPhase(GamePhase phase) {
    return phase == GamePhase.ROUND_RESULTS || phase == GamePhase.GAME_RESULTS;
  }

  private static int count(List<Integer> rounds, IntPredicate hit) {
    return (int) rounds.stream().mapToInt(Integer::intValue).filter(hit).count();
  }

  /** Por puntos, 5 objetivos: la distancia de cada ronda, o {@code -1} sin elección; acierto es la distancia 0. */
  private static final class PokedexDistance implements DailyGame {

    @Override public String gameId() { return "pokedex-distance"; }

    @Override public int roundCount() { return 5; }

    @Override
    public JsonNode config(JsonNode defaultConfig) {
      return withKeys(defaultConfig, Map.of("mode", JsonNode.createStringNode("POINTS"),
          "pointsRounds", JsonNode.createNumberNode(5)));
    }

    /** Solo en {@code GAME_RESULTS} se publica {@code roundHistory}; los desempates ({@code tiebreakDepth > 0}) no cuentan. */
    @Override
    public void observe(Object publicState, String playerId, SortedMap<Integer, Integer> outcomes) {
      if (!(publicState instanceof PokedexDistancePublicState state) || state.phase() != GamePhase.GAME_RESULTS) return;
      for (var record : state.roundHistory()) {
        if (record.tiebreakDepth() != 0) continue;
        var distance = record.distances().get(playerId);
        outcomes.put(record.roundNumber(), distance == null ? -1 : distance);
      }
    }

    @Override public int missingValue() { return -1; }

    @Override public int correct(List<Integer> rounds) { return count(rounds, value -> value == 0); }
  }

  /** Clásico, 10 rondas de 4 opciones: {@code 1} acierto, {@code 0} votó mal, {@code -1} no votó. */
  private static final class ShinyVote implements DailyGame {

    @Override public String gameId() { return "shiny-vote"; }

    @Override public int roundCount() { return 10; }

    @Override
    public JsonNode config(JsonNode defaultConfig) {
      return withKeys(defaultConfig, Map.of("mode", JsonNode.createStringNode("CLASSIC"),
          "rounds", JsonNode.createNumberNode(10), "optionCount", JsonNode.createNumberNode(4)));
    }

    /** La clave es {@code lastRound.roundNumber}. */
    @Override
    public void observe(Object publicState, String playerId, SortedMap<Integer, Integer> outcomes) {
      if (!(publicState instanceof ShinyVotePublicState state) || !resultsPhase(state.phase())) return;
      var round = state.lastRound();
      if (round == null) return;
      int value = round.correctPlayerIds().contains(playerId) ? 1 : round.votes().containsKey(playerId) ? 0 : -1;
      outcomes.put(round.roundNumber(), value);
    }

    @Override public int missingValue() { return -1; }

    @Override public int correct(List<Integer> rounds) { return count(rounds, value -> value == 1); }
  }

  /** Clásico, 10 comparaciones: {@code 1} acierto, {@code 0} fallo, {@code -1} sin respuesta. */
  private static final class HigherLower implements DailyGame {

    @Override public String gameId() { return "higher-lower"; }

    @Override public int roundCount() { return 10; }

    @Override
    public JsonNode config(JsonNode defaultConfig) {
      return withKeys(defaultConfig, Map.of("mode", JsonNode.createStringNode("CLASSIC"),
          "rounds", JsonNode.createNumberNode(10)));
    }

    /** {@code lastRound} no lleva número: la clave es el {@code roundNumber} público, que sigue en la ronda revelada. */
    @Override
    public void observe(Object publicState, String playerId, SortedMap<Integer, Integer> outcomes) {
      if (!(publicState instanceof HigherLowerPublicState state) || !resultsPhase(state.phase())) return;
      var round = state.lastRound();
      if (round == null) return;
      var outcome = round.outcomes().get(playerId);
      int value = outcome == null || outcome.choice() == null ? -1 : outcome.correct() ? 1 : 0;
      outcomes.put(state.roundNumber(), value);
    }

    @Override public int missingValue() { return -1; }

    @Override public int correct(List<Integer> rounds) { return count(rounds, value -> value == 1); }
  }

  /**
   * Revelación manual, 3 Pokémon de 90 s: los grupos que veía al acertar ({@code revealStage + 1}) o {@code 0}. El
   * motor solo publica {@code lastRound} en {@code ROUND_RESULTS}, así que la última ronda se apunta en esa difusión.
   */
  private static final class LearnsetGuess implements DailyGame {

    @Override public String gameId() { return "learnset-guess"; }

    @Override public int roundCount() { return 3; }

    @Override
    public JsonNode config(JsonNode defaultConfig) {
      return withKeys(defaultConfig, Map.of("mode", JsonNode.createStringNode("MANUAL_REVEAL"),
          "rounds", JsonNode.createNumberNode(3), "roundSeconds", JsonNode.createNumberNode(90)));
    }

    @Override
    public void observe(Object publicState, String playerId, SortedMap<Integer, Integer> outcomes) {
      if (!(publicState instanceof LearnsetGuessPublicState state) || !resultsPhase(state.phase())) return;
      var round = state.lastRound();
      if (round == null) return;
      var solve = round.solves().get(playerId);
      outcomes.put(state.roundNumber(), solve == null ? 0 : solve.revealStage() + 1);
    }

    @Override public int missingValue() { return 0; }

    @Override public int correct(List<Integer> rounds) { return count(rounds, value -> value >= 1); }
  }
}
