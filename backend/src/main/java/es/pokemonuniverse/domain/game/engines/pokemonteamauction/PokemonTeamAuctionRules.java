package es.pokemonuniverse.domain.game.engines.pokemonteamauction;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.PokemonTeamAuctionState;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionParticipant;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionPlayerStats;
import java.util.Comparator;
import java.util.Objects;

/** Traducción literal de {@code pokemon-team-auction/rules.ts}. */
public final class PokemonTeamAuctionRules {

  private PokemonTeamAuctionRules() {}

  /**
   * BST del equipo, monedas restantes, legendarios y míticos, de mayor a menor. El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor (cuid y
   * {@code guest_<uuid>}; ver el README de motores).
   */
  public static GameResults buildTeamAuctionResults(PokemonTeamAuctionState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the auction finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> {
          var stats = TeamAuctionPlayerStats.of(Objects.requireNonNull(state.participants().get(playerId)),
              (int) state.lotHistory().stream().filter(lot -> playerId.equals(lot.winnerId())).count(),
              (int) state.lotHistory().stream().filter(lot -> lot.winnerId() == null).count());
          return new Scoring.ScoreEntry<>(playerId, stats.bstTotal(), stats);
        })
        .toList();
    Comparator<Scoring.ScoreEntry<TeamAuctionPlayerStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().coinsRemaining(), left.stats().coinsRemaining());
      if (result == 0) result = Integer.compare(right.stats().legendaryCount(), left.stats().legendaryCount());
      if (result == 0) result = Integer.compare(right.stats().mythicalCount(), left.stats().mythicalCount());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().coinsRemaining() + ":" + entry.stats().legendaryCount() + ":"
            + entry.stats().mythicalCount(),
        entry -> entry.stats().toMap());
  }

  /** {@code participantStats(participant, lotsWon, unownedLots)}. */
  public static TeamAuctionPlayerStats participantStats(TeamAuctionParticipant participant, int lotsWon,
      int unownedLots) {
    return TeamAuctionPlayerStats.of(participant, lotsWon, unownedLots);
  }
}
