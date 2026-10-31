package es.pokemonuniverse.domain.game;

import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

/** Traducción literal de {@code packages/shared/src/scoring.ts}. */
public final class Scoring {

  /** V1: el orden lo dan las clasificaciones de cada juego; sus unidades nunca entran en los totales de sesión. */
  public static final String SESSION_SCORING_VERSION = "POSITION_V1";

  public record ScoreEntry<S>(String playerId, int points, S stats) {}

  public record RankedEntry<T>(T entry, int position) {}

  private Scoring() {}

  /** Base según el tamaño del grupo más multiplicador de podio (aritmética {@code double}, como JS). */
  public static int pointsForPosition(int playerCount, int position) {
    if (playerCount < 1 || position < 1 || position > playerCount) {
      throw new IllegalArgumentException("Invalid player count or position");
    }
    int base = playerCount - position + 1;
    if (position == 1) return base * 2;
    if (position == 2) return (int) Math.ceil(base * 1.5);
    if (position == 3) return (int) Math.ceil(base * 1.2);
    return base;
  }

  /**
   * Clasificación de competición (1, 2, 2, 4) con orden y desempate propios del juego. La ordenación es estable como
   * {@code Array.prototype.sort}. Las claves se comparan con {@link Objects#equals} (TS usa {@code Object.is}, igual
   * para cadenas y números); ojo: un {@code Integer} 5 no es igual a un {@code Long} 5.
   */
  public static <T, K> List<RankedEntry<T>> rankCompetition(List<T> entries, Comparator<? super T> compare,
      Function<? super T, K> tieKey) {
    var ordered = new ArrayList<T>(entries);
    ordered.sort(compare);
    var ranked = new ArrayList<RankedEntry<T>>(ordered.size());
    K previousKey = null;
    int position = 0;
    for (int index = 0; index < ordered.size(); index++) {
      var entry = ordered.get(index);
      var key = tieKey.apply(entry);
      if (index == 0 || !Objects.equals(key, previousKey)) position = index + 1;
      previousKey = key;
      ranked.add(new RankedEntry<>(entry, position));
    }
    return ranked;
  }

  /** Proyección común de clasificaciones; orden y estadísticas siguen siendo del juego. */
  public static <S, K> GameResults buildRankedResults(List<ScoreEntry<S>> entries,
      Comparator<? super ScoreEntry<S>> compare, Function<? super ScoreEntry<S>, K> tieKey,
      Function<? super ScoreEntry<S>, ? extends Map<String, ? extends Number>> mapStats) {
    var standings = rankCompetition(entries, compare, tieKey).stream()
        .map(ranked -> new GameStanding(ranked.entry().playerId(), ranked.position(), ranked.entry().points(),
            ranked.position() == 1, new LinkedHashMap<String, Number>(mapStats.apply(ranked.entry()))))
        .toList();
    var leaders = standings.stream().filter(standing -> standing.position() == 1).toList();
    return new GameResults(leaders.size() == 1 ? leaders.getFirst().playerId() : null, standings);
  }

  /** Sin {@code mapStats}: copia las estadísticas ({@code { ...entry.stats }}); Java no puede expandir un record. */
  public static <S extends Map<String, ? extends Number>, K> GameResults buildRankedResults(List<ScoreEntry<S>> entries,
      Comparator<? super ScoreEntry<S>> compare, Function<? super ScoreEntry<S>, K> tieKey) {
    return buildRankedResults(entries, compare, tieKey, ScoreEntry::stats);
  }

  public static Map<String, Integer> sessionPointsForResults(GameResults results) {
    int count = results.standings().size();
    var points = new LinkedHashMap<String, Integer>();
    for (var standing : results.standings()) {
      points.put(standing.playerId(), standing.points() > 0 ? pointsForPosition(count, standing.position()) : 0);
    }
    return points;
  }
}
