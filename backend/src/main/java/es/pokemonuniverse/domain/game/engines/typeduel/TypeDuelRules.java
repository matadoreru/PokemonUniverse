package es.pokemonuniverse.domain.game.engines.typeduel;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelState;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelStats;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

/** Traducción literal de {@code type-duel/rules.ts}. */
public final class TypeDuelRules {

  public static final int WIN_POINTS = 5;
  public static final long ATTEMPT_COOLDOWN_MS = 1_000;
  public static final int MAX_SOLUTIONS = 8;
  /** La tercera combinación imposible seguida cierra el duelo sin puntos ({@code INVALID_COMBINATION}). */
  public static final int TYPE_DUEL_MAX_INVALID_COMBINATIONS = 3;

  private TypeDuelRules() {}

  /** {@code requiredTypeCombination}: un único tipo si ambos duelistas eligen el mismo. */
  public static List<String> requiredTypeCombination(String typeA, String typeB) {
    return typeA.equals(typeB) ? List.of(typeA) : List.of(typeA, typeB);
  }

  /** Combinación exacta: mismo número de tipos y todos los requeridos presentes. */
  public static boolean isValidPokemonForTypes(Pokemon pokemon, String typeA, String typeB) {
    var required = requiredTypeCombination(typeA, typeB);
    if (pokemon.types().size() != required.size()) return false;
    return pokemon.types().containsAll(required);
  }

  /**
   * Pareja con menos participaciones acumuladas que no repita la anterior si hay alternativa. Consume {@code random}
   * exactamente una vez.
   */
  public static List<String> chooseBalancedPair(List<String> playerIds, Map<String, Integer> counts,
      @Nullable List<String> lastPair, DoubleSupplier random) {
    var pairs = new ArrayList<List<String>>();
    for (int a = 0; a < playerIds.size(); a += 1) {
      for (int b = a + 1; b < playerIds.size(); b += 1) pairs.add(List.of(playerIds.get(a), playerIds.get(b)));
    }
    int minimum = pairs.stream().mapToInt(pair -> sum(counts, pair)).min().orElse(Integer.MAX_VALUE);
    var candidates = pairs.stream().filter(pair -> sum(counts, pair) == minimum).toList();
    var withoutRepeat = candidates.stream()
        .filter(pair -> lastPair == null || !(pair.contains(lastPair.get(0)) && pair.contains(lastPair.get(1))))
        .toList();
    if (!withoutRepeat.isEmpty()) candidates = withoutRepeat;
    return candidates.get(Math.min((int) Math.floor(random.getAsDouble() * candidates.size()), candidates.size() - 1));
  }

  private static int sum(Map<String, Integer> counts, List<String> pair) {
    return counts.getOrDefault(pair.get(0), 0) + counts.getOrDefault(pair.get(1), 0);
  }

  /**
   * Clasificación final con {@code winRate} y {@code averageCorrectTimeMs} derivados. El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo} (equivalente sobre ids de jugador, ver el README de
   * motores, regla 21).
   */
  public static GameResults buildTypeDuelResults(TypeDuelState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) throw new EngineException("Results unavailable");
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().get(playerId)))
        .toList();
    Comparator<Scoring.ScoreEntry<TypeDuelStats>> compare = (left, right) -> {
      int byPoints = Integer.compare(right.points(), left.points());
      return byPoints != 0 ? byPoints : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
      var stats = entry.stats();
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("duelsPlayed", stats.duelsPlayed());
      mapped.put("duelsWon", stats.duelsWon());
      mapped.put("correctAttempts", stats.correctAttempts());
      mapped.put("incorrectAttempts", stats.incorrectAttempts());
      mapped.put("correctTimeTotalMs", stats.correctTimeTotalMs());
      mapped.put("winRate", stats.duelsPlayed() != 0
          ? Math.round((double) stats.duelsWon() / stats.duelsPlayed() * 100) : 0);
      mapped.put("averageCorrectTimeMs", stats.correctAttempts() != 0
          ? Math.round((double) stats.correctTimeTotalMs() / stats.correctAttempts()) : 0);
      return mapped;
    });
  }
}
