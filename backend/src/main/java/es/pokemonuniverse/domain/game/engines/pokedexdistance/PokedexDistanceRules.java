package es.pokemonuniverse.domain.game.engines.pokedexdistance;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.DistanceRoundRecord;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.EliminationReason;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.EliminationRecord;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PlayerRoundStats;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceState;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.RoundSelection;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code pokedex-distance/rules.ts}. */
public final class PokedexDistanceRules {

  /**
   * Desempates como máximo antes de resolver un empate a la fuerza. En {@code HIDDEN} los empatados pueden repetir el
   * mismo Pokémon en cada desempate; el tope garantiza que la partida acabe ({@code maxTiebreaks} es de la Fase 3).
   */
  public static final int MAX_TIEBREAK_DEPTH = 3;

  private PokedexDistanceRules() {}

  public static int distanceBetween(int selectedDex, int targetDex) {
    return Math.abs(selectedDex - targetDex);
  }

  /** Jugadores con la distancia máxima, en el orden de inserción de {@code selections} ({@code Object.entries}). */
  public static List<String> farthestPlayerIds(Map<String, RoundSelection> selections) {
    if (selections.isEmpty()) return List.of();
    int maximum = selections.values().stream().mapToInt(RoundSelection::distance).max().orElseThrow();
    return selections.entrySet().stream()
        .filter(entry -> entry.getValue().distance() == maximum)
        .map(Map.Entry::getKey)
        .toList();
  }

  /**
   * Empate en el tope de desempates: caen los empatados que eligieron los últimos (mayor {@code selectedAt}); si todos
   * eligieron a la vez, caen todos. Conserva el orden de {@code tiedIds} y siempre elimina al menos a uno.
   */
  public static List<String> lastToSelectIds(Map<String, RoundSelection> selections, List<String> tiedIds) {
    long latest = tiedIds.stream().mapToLong(id -> selections.get(id).selectedAt()).max().orElseThrow();
    return tiedIds.stream().filter(id -> selections.get(id).selectedAt() == latest).toList();
  }

  /**
   * Posición por supervivencia: el ganador es 1.º y cada eliminación ocupa {@code remainingAfter + 1}; sin ganador,
   * quien quede 1.º no puntúa. No pasa por {@code buildRankedResults}, así que {@code won} queda ausente. El desempate
   * de TS es {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor
   * (cuid de usuario y {@code guest_<uuid>}: el {@code _} solo en el prefijo fijo, los {@code -} en posiciones fijas,
   * así que difieren siempre en minúsculas o dígitos, donde ICU y UTF-16 ordenan igual). Los nombres visibles
   * necesitarían un {@link java.text.Collator}. {@code List.sort} es estable como {@code Array.prototype.sort}.
   */
  public static GameResults buildResults(PokedexDistanceState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    int total = state.initialPlayerIds().size();
    var positions = new HashMap<String, Integer>();
    // `if (state.winnerId)`: los ids nunca son la cadena vacía, así que basta con comprobar que no es nulo.
    if (state.winnerId() != null) positions.put(state.winnerId(), 1);
    var eliminations = state.eliminations();
    for (int index = eliminations.size() - 1; index >= 0; index--) {
      var elimination = eliminations.get(index);
      int position = elimination.remainingAfter() + 1;
      for (var playerId : elimination.playerIds()) positions.put(playerId, position);
    }
    var standings = new ArrayList<GameStanding>(total);
    for (var playerId : state.initialPlayerIds()) {
      int position = positions.getOrDefault(playerId, total);
      var stats = state.playerStats().getOrDefault(playerId, PlayerRoundStats.ZERO);
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("exactHits", stats.exactHits());
      mapped.put("roundsSurvived", stats.roundsSurvived());
      mapped.put("selections", stats.selections());
      mapped.put("averageDistance", stats.selections() == 0 ? 0
          : Math.round((double) stats.distanceTotal() / stats.selections() * 100) / 100.0);
      mapped.put("tiebreaksWon", stats.tiebreaksWon());
      int points = state.winnerId() == null && position == 1 ? 0 : Scoring.pointsForPosition(total, position);
      standings.add(new GameStanding(playerId, position, points, null, mapped));
    }
    standings.sort(Comparator.comparingInt(GameStanding::position).thenComparing(GameStanding::playerId));
    return new GameResults(state.winnerId(), standings);
  }

  /** {@code emptyPlayerStats}. */
  public static PlayerRoundStats emptyPlayerStats() {
    return PlayerRoundStats.ZERO;
  }

  /** Recibe el estado previo a eliminar: {@code remainingAfter} descuenta a los eliminados de los supervivientes. */
  public static EliminationRecord elimination(List<String> playerIds, EliminationReason reason,
      PokedexDistanceState state) {
    return new EliminationRecord(playerIds, reason, state.roundNumber(), state.survivorIds().size() - playerIds.size());
  }

  /** {@code roundRecord}: el registro de la ronda que se resuelve ahora, una distancia por elegible ({@code null} si no respondió). */
  public static DistanceRoundRecord roundRecord(PokedexDistanceState state, List<String> eliminatedIds) {
    var distances = new LinkedHashMap<String, Integer>();
    for (var id : state.eligibleIds()) {
      var selection = state.selections().get(id);
      distances.put(id, selection == null ? null : selection.distance());
    }
    return new DistanceRoundRecord(state.roundNumber(), state.tiebreakDepth(),
        Objects.requireNonNull(state.targetDexNumber(), "targetDexNumber"), distances, eliminatedIds);
  }
}
