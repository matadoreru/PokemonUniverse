package es.pokemonuniverse.domain.game.engines.whoiswhopokemon;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoState;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoStats;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.DoubleSupplier;

/** Traducción literal de {@code who-is-who-pokemon/rules.ts} y del {@code choose} de {@code server.ts}. */
public final class WhoIsWhoPokemonRules {

  /** {@code WHO_IS_WHO_WIN_POINTS}. */
  public static final int WIN_POINTS = 10;

  private WhoIsWhoPokemonRules() {}

  /**
   * {@code choose}: saca {@code count} elementos de un pool que se encoge ({@code splice}), un {@code random()} por
   * elección con {@code Math.min(Math.floor(r * n), n - 1)}. No es Fisher–Yates: consume {@code count} sorteos.
   */
  static <T> List<T> choose(List<T> items, int count, DoubleSupplier random) {
    var pool = new ArrayList<>(items);
    var result = new ArrayList<T>();
    while (result.size() < count && !pool.isEmpty()) {
      int index = Math.min((int) Math.floor(random.getAsDouble() * pool.size()), pool.size() - 1);
      result.add(pool.remove(index));
    }
    return result;
  }

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
