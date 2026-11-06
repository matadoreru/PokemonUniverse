package es.pokemonuniverse.domain.game.engines.typeduel;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
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
   * {@code COOP}: las combinaciones de tipos (un tipo o dos, sin orden) con al menos un Pokémon de {@code pool}, en el
   * orden de {@code POKEMON_TYPES}: primero el tipo {@code a} solo y luego {@code a} con cada tipo posterior.
   */
  public static List<List<String>> coopCombinations(List<Pokemon> pool) {
    var types = TypeDuelTypes.POKEMON_TYPES;
    var combinations = new ArrayList<List<String>>();
    for (int a = 0; a < types.size(); a += 1) {
      for (int b = a; b < types.size(); b += 1) {
        var typeA = types.get(a);
        var typeB = types.get(b);
        if (pool.stream().anyMatch(pokemon -> isValidPokemonForTypes(pokemon, typeA, typeB))) {
          combinations.add(requiredTypeCombination(typeA, typeB));
        }
      }
    }
    return combinations;
  }

  /** Clave estable de una combinación ({@code fire/flying}, {@code ice}) para no repetirla entre rondas. */
  public static String combinationKey(List<String> combination) {
    return String.join("/", combination);
  }

  /** {@code isValidPokemonForTypes} con una combinación de uno o dos tipos. */
  public static boolean matchesCombination(Pokemon pokemon, List<String> combination) {
    return isValidPokemonForTypes(pokemon, combination.getFirst(), combination.getLast());
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
   * Clasificación final con {@code winRate} y {@code averageCorrectTimeMs} derivados. En {@code COOP}, los puntos son
   * la aportación, las estadísticas suman {@code contribution} y {@code groupTotal}, y nadie gana ({@code winnerId} y
   * {@code won} nulos). El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo} (equivalente sobre ids de jugador, ver el README de
   * motores, regla 21).
   */
  public static GameResults buildTypeDuelResults(TypeDuelState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) throw new EngineException("Results unavailable");
    boolean coop = state.config().mode() == TypeDuelMode.COOP;
    // COOP: la clasificación (y la de la sesión) usa la aportación de cada uno; no hay ganador individual.
    int groupTotal = state.contributions().values().stream().mapToInt(Integer::intValue).sum();
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId,
            coop ? state.contributions().getOrDefault(playerId, 0) : state.scores().getOrDefault(playerId, 0),
            state.playerStats().get(playerId)))
        .toList();
    Comparator<Scoring.ScoreEntry<TypeDuelStats>> compare = (left, right) -> {
      int byPoints = Integer.compare(right.points(), left.points());
      return byPoints != 0 ? byPoints : left.playerId().compareTo(right.playerId());
    };
    var results = Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
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
      if (coop) {
        mapped.put("contribution", entry.points());
        mapped.put("groupTotal", groupTotal);
      }
      return mapped;
    });
    if (!coop) return results;
    return new GameResults(null, results.standings().stream()
        .map(standing -> new GameStanding(standing.playerId(), standing.position(), standing.points(), null,
            standing.stats()))
        .toList());
  }
}
