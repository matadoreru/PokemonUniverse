package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsState;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsStats;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** Traducción literal del TS que antes estaba en {@code pokemon-connections/rules.ts}. */
public final class PokemonConnectionsRules {

  /** {@code CONNECTIONS_COMPLETION_BONUSES}: bonificación del primero, segundo y tercero en completar. */
  public static final List<Integer> CONNECTIONS_COMPLETION_BONUSES = List.of(3, 2, 1);

  private PokemonConnectionsRules() {}

  /** {@code completionBonus}: 0 a partir del cuarto; un puesto menor que 1 es un error de programación. */
  public static int completionBonus(int rank) {
    if (rank < 1) throw new EngineException("Invalid completion rank");
    return rank <= CONNECTIONS_COMPLETION_BONUSES.size() ? CONNECTIONS_COMPLETION_BONUSES.get(rank - 1) : 0;
  }

  /**
   * Puntos, tableros completados y grupos encontrados de mayor a menor, luego menos errores; los empates de puntos
   * comparten puesto. El desempate de TS es {@code playerId.localeCompare}; aquí {@link String#compareTo},
   * equivalente para los ids del servidor (cuid y {@code guest_<uuid>}; ver el README de motores).
   */
  public static GameResults buildPokemonConnectionsResults(PokemonConnectionsState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId,
            Objects.requireNonNullElse(state.scores().get(playerId), 0),
            Objects.requireNonNullElse(state.playerStats().get(playerId), PokemonConnectionsStats.EMPTY)))
        .toList();
    Comparator<Scoring.ScoreEntry<PokemonConnectionsStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().boardsSolved(), left.stats().boardsSolved());
      if (result == 0) result = Integer.compare(right.stats().groupsFound(), left.stats().groupsFound());
      if (result == 0) result = Integer.compare(left.stats().mistakes(), right.stats().mistakes());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}
