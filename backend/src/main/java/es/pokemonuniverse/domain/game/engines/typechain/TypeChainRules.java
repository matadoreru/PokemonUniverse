package es.pokemonuniverse.domain.game.engines.typechain;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainFinishReason;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainPlayerStats;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;

/** Traducción literal de {@code type-chain/rules.ts}. */
public final class TypeChainRules {

  private TypeChainRules() {}

  /** Posición en la clasificación ({@code { playerId, position }}). */
  public record RankedPlayer(String playerId, int position) {}

  /** Tipos de {@code previous} (sin duplicados, en su orden) que también tiene {@code candidate}. */
  public static List<String> sharedPokemonTypes(Pokemon previous, Pokemon candidate) {
    var candidateTypes = new LinkedHashSet<>(candidate.types());
    return new LinkedHashSet<>(previous.types()).stream().filter(candidateTypes::contains).toList();
  }

  public static boolean isValidTypeChainTransition(Pokemon previous, Pokemon candidate) {
    return sharedPokemonTypes(previous, candidate).size() == 1;
  }

  public static List<Pokemon> getValidTypeChainCandidates(Pokemon previousPokemon, List<Pokemon> allowedPokemon,
      Collection<String> usedPokemonIds) {
    return allowedPokemon.stream()
        .filter(candidate -> !usedPokemonIds.contains(candidate.id())
            && isValidTypeChainTransition(previousPokemon, candidate))
        .toList();
  }

  static TypeChainPlayerStats statsOf(TypeChainState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? TypeChainPlayerStats.ZERO : stats;
  }

  /**
   * {@code b.validSubmissions - a.validSubmissions || a.invalidAttempts - b.invalidAttempts || left.localeCompare(right)}.
   * El desempate de TS es {@code localeCompare} sobre ids de jugador; aquí {@link String#compareTo}, equivalente para
   * los ids del servidor (cuid y {@code guest_<uuid>}; ver el README de motores).
   */
  static int failsafeCompare(TypeChainState state, String left, String right) {
    var a = statsOf(state, left);
    var b = statsOf(state, right);
    int bySubmissions = Integer.compare(b.validSubmissions(), a.validSubmissions());
    if (bySubmissions != 0) return bySubmissions;
    int byInvalid = Integer.compare(a.invalidAttempts(), b.invalidAttempts());
    return byInvalid != 0 ? byInvalid : left.compareTo(right);
  }

  private static boolean tiedFailsafe(TypeChainState state, String left, String right) {
    var a = statsOf(state, left);
    var b = statsOf(state, right);
    return a.validSubmissions() == b.validSubmissions() && a.invalidAttempts() == b.invalidAttempts();
  }

  public static List<RankedPlayer> typeChainRanking(TypeChainState state) {
    var eliminatedReversed = new ArrayList<>(state.eliminations()).reversed();
    if (state.finishReason() == TypeChainFinishReason.SURVIVOR) {
      var ordered = new ArrayList<>(state.activePlayerIds());
      for (var entry : eliminatedReversed) ordered.add(entry.playerId());
      var ranking = new ArrayList<RankedPlayer>();
      for (int index = 0; index < ordered.size(); index++) ranking.add(new RankedPlayer(ordered.get(index), index + 1));
      return ranking;
    }
    var alive = new ArrayList<>(state.activePlayerIds());
    alive.sort((a, b) -> failsafeCompare(state, a, b));
    String prior = null;
    int position = 0;
    var ranking = new ArrayList<RankedPlayer>();
    for (int index = 0; index < alive.size(); index++) {
      var playerId = alive.get(index);
      if (prior == null || !tiedFailsafe(state, prior, playerId)) position = index + 1;
      prior = playerId;
      ranking.add(new RankedPlayer(playerId, position));
    }
    for (int index = 0; index < eliminatedReversed.size(); index++) {
      ranking.add(new RankedPlayer(eliminatedReversed.get(index).playerId(), alive.size() + index + 1));
    }
    return ranking;
  }

  public static GameResults buildTypeChainResults(TypeChainState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    int longestChain = Math.max(state.longestChain(), state.chain().size());
    var ranking = typeChainRanking(state);
    int total = state.playerIds().size();
    var standings = ranking.stream().map(ranked -> {
      var stats = statsOf(state, ranked.playerId());
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("validSubmissions", stats.validSubmissions());
      mapped.put("invalidAttempts", stats.invalidAttempts());
      mapped.put("turnsSurvived", stats.turnsSurvived());
      mapped.put("timeoutEliminations", stats.timeoutEliminations());
      mapped.put("longestChain", longestChain);
      return new GameStanding(ranked.playerId(), ranked.position(), Scoring.pointsForPosition(total, ranked.position()),
          ranked.playerId().equals(state.winnerId()), mapped);
    }).toList();
    return new GameResults(state.winnerId(), standings);
  }
}
