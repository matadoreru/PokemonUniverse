package es.pokemonuniverse.domain.game.engines.pokemonbluffauction;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.PokemonBluffAuctionState;
import java.util.Comparator;
import java.util.Objects;

/** Traducción literal del TS que antes estaba en {@code pokemon-bluff-auction/rules.ts}. */
public final class PokemonBluffAuctionRules {

  public static final int BLUFF_BIDDER_SUCCESS_POINTS = 5;
  public static final int BLUFF_OTHERS_SUCCESS_POINTS = 2;

  private PokemonBluffAuctionRules() {}

  /** {@code emptyBluffAuctionStats()}. */
  public static BluffAuctionPlayerStats emptyBluffAuctionStats() {
    return BluffAuctionPlayerStats.EMPTY;
  }

  /**
   * Puntos, rondas ganadas y mayor apuesta completada, de mayor a menor; los empates de puntos comparten puesto. El
   * desempate de TS es {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del
   * servidor (cuid y {@code guest_<uuid>}; ver el README de motores).
   */
  public static GameResults buildPokemonBluffAuctionResults(PokemonBluffAuctionState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId,
            Objects.requireNonNullElse(state.scores().get(playerId), 0),
            Objects.requireNonNullElse(state.playerStats().get(playerId), emptyBluffAuctionStats())))
        .toList();
    Comparator<Scoring.ScoreEntry<BluffAuctionPlayerStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().roundsWon(), left.stats().roundsWon());
      if (result == 0) {
        result = Integer.compare(right.stats().highestCompletedBid(), left.stats().highestCompletedBid());
      }
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}
