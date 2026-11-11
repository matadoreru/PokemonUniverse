package es.pokemonuniverse.domain.game.engines.secretranking;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingPlayerStats;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingState;
import es.pokemonuniverse.domain.json.JsNumbers;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Traducción literal del TS que antes estaba en {@code secret-ranking/rules.ts}. */
public final class SecretRankingRules {

  private SecretRankingRules() {}

  /** {@code RankingDistance}: {@code distance = distanceUnits / peerCount} en aritmética {@code double}. */
  public record RankingDistance(String playerId, double distance, int distanceUnits, int position, int points) {}

  private record RawDistance(String playerId, int distanceUnits, double distance) {}

  static SecretRankingPlayerStats statsOf(SecretRankingState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? SecretRankingPlayerStats.ZERO : stats;
  }

  /**
   * Distancia de Spearman (footrule) contra la posición media del resto de rankings enviados. {@code submissions}
   * conserva el orden de inserción; el desempate de TS es {@code playerId.localeCompare}, aquí
   * {@link String#compareTo}, equivalente para los ids del servidor (ver el README de motores).
   */
  public static List<RankingDistance> secretRankingDistances(Map<String, List<String>> submissions) {
    var entries = new ArrayList<>(submissions.entrySet());
    if (entries.size() < 2) return List.of();
    var pokemonIds = entries.getFirst().getValue();
    var positionMaps = new HashMap<String, Map<String, Integer>>();
    for (var entry : entries) {
      var positions = new HashMap<String, Integer>();
      var ranking = entry.getValue();
      for (int index = 0; index < ranking.size(); index++) positions.put(ranking.get(index), index + 1);
      positionMaps.put(entry.getKey(), positions);
    }
    int peerCount = entries.size() - 1;
    var raw = new ArrayList<RawDistance>();
    for (var entry : entries) {
      var playerId = entry.getKey();
      var own = positionMaps.get(playerId);
      int distanceUnits = 0;
      for (var pokemonId : pokemonIds) {
        int ownPosition = own.get(pokemonId);
        int peerPositionTotal = 0;
        for (var peer : entries) {
          if (!peer.getKey().equals(playerId)) peerPositionTotal += positionMaps.get(peer.getKey()).get(pokemonId);
        }
        distanceUnits += Math.abs(ownPosition * peerCount - peerPositionTotal);
      }
      raw.add(new RawDistance(playerId, distanceUnits, (double) distanceUnits / peerCount));
    }
    Comparator<RawDistance> compare = (left, right) -> {
      int result = Integer.compare(left.distanceUnits(), right.distanceUnits());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.rankCompetition(raw, compare, RawDistance::distanceUnits).stream()
        .map(ranked -> new RankingDistance(ranked.entry().playerId(), ranked.entry().distance(),
            ranked.entry().distanceUnits(), ranked.position(),
            Scoring.pointsForPosition(entries.size(), ranked.position())))
        .toList();
  }

  /**
   * Puntos, rankings más cercanos y rankings enviados de mayor a menor, y distancia total de menor a mayor. El
   * desempate final es {@link String#compareTo} (el {@code localeCompare} de TS sobre ids del servidor).
   */
  public static GameResults buildSecretRankingResults(SecretRankingState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before Secret Ranking finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(), playerId -> statsOf(state, playerId));
    Comparator<Scoring.ScoreEntry<SecretRankingPlayerStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().roundWins(), left.stats().roundWins());
      if (result == 0) result = Integer.compare(right.stats().rankingsSubmitted(), left.stats().rankingsSubmitted());
      if (result == 0) result = Double.compare(left.stats().distanceTotal(), right.stats().distanceTotal());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().roundWins() + ":" + entry.stats().rankingsSubmitted() + ":"
            + JsNumbers.format(entry.stats().distanceTotal()),
        entry -> entry.stats().toMap());
  }
}
