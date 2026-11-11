package es.pokemonuniverse.domain.game.engines.whoiswhopokemon;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoState;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoStats;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;

/** Traducción literal de {@code who-is-who-pokemon/rules.ts}; el {@code choose} de {@code server.ts} es {@code Randoms.takeRandom}. */
public final class WhoIsWhoPokemonRules {

  /** {@code WHO_IS_WHO_WIN_POINTS}. */
  public static final int WIN_POINTS = 10;

  private WhoIsWhoPokemonRules() {}

  /**
   * Clasificación por puntos y luego {@code playerId.localeCompare}, aquí {@link String#compareTo} (equivalente para
   * los ids del servidor, ver el README de motores); empate por puntos. {@code won} de TS no entra en la proyección.
   */
  public static GameResults buildWhoIsWhoResults(WhoIsWhoState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, WhoIsWhoStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<WhoIsWhoStats>> compare = (left, right) -> {
      int byPoints = Integer.compare(right.points(), left.points());
      return byPoints != 0 ? byPoints : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
      var stats = entry.stats();
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("wins", stats.wins());
      mapped.put("turnsPlayed", stats.turnsPlayed());
      mapped.put("correctGuesses", stats.correctGuesses());
      mapped.put("incorrectGuesses", stats.incorrectGuesses());
      return mapped;
    });
  }
}
