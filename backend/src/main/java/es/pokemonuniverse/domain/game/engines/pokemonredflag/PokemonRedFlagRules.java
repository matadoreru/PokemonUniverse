package es.pokemonuniverse.domain.game.engines.pokemonredflag;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagState;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagStats;
import java.util.Comparator;

/** Traducción literal de {@code pokemon-red-flag/rules.ts}. */
public final class PokemonRedFlagRules {

  /** {@code POKEMON_RED_FLAG_WIN_POINTS}. */
  public static final int WIN_POINTS = 3;

  private PokemonRedFlagRules() {}

  static PokemonRedFlagStats statsOf(PokemonRedFlagState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? PokemonRedFlagStats.ZERO : stats;
  }

  /**
   * Puntos, victorias en solitario, victorias y votos recibidos, de mayor a menor. El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor (cuid y
   * {@code guest_<uuid>}; ver el README de motores).
   */
  public static GameResults buildPokemonRedFlagResults(PokemonRedFlagState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before Pokémon Red Flag finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            statsOf(state, playerId)))
        .toList();
    Comparator<Scoring.ScoreEntry<PokemonRedFlagStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().soloWins(), left.stats().soloWins());
      if (result == 0) result = Integer.compare(right.stats().roundWins(), left.stats().roundWins());
      if (result == 0) result = Integer.compare(right.stats().votesReceived(), left.stats().votesReceived());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().soloWins() + ":" + entry.stats().roundWins() + ":"
            + entry.stats().votesReceived(),
        entry -> entry.stats().toMap());
  }
}
