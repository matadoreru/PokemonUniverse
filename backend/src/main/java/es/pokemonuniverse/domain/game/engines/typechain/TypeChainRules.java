package es.pokemonuniverse.domain.game.engines.typechain;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainPlayerStats;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Traducción literal del TS que antes estaba en {@code type-chain/rules.ts}. La web conserva allí una copia de
 * {@code TYPE_CHAIN_MIN_TYPE_POKEMON}: si cambia aquí, hay que cambiarla también allí.
 */
public final class TypeChainRules {

  private TypeChainRules() {}

  /** Posición en la clasificación ({@code { playerId, position }}). */
  public record RankedPlayer(String playerId, int position) {}

  /** {@code TYPE_CHAIN_MIN_TYPE_POKEMON}: Pokémon del pool que debe tener un tipo para poder ser el de una cadena. */
  public static final int MIN_TYPE_POKEMON = 10;

  /** {@code POKEMON_TYPES} de {@code pokemon/types.ts}, en su orden. */
  static final List<String> POKEMON_TYPES = List.of("normal", "fire", "water", "electric", "grass", "ice", "fighting",
      "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy");

  /** ¿Vale el Pokémon en una cadena de este tipo? Basta con que sea uno de sus tipos. */
  public static boolean hasTypeChainType(Pokemon candidate, String chainType) {
    return candidate.types().contains(chainType);
  }

  /** Tipos que pueden ser el de una cadena, en el orden de {@code POKEMON_TYPES}. */
  public static List<String> typeChainEligibleTypes(List<Pokemon> allowed) {
    return POKEMON_TYPES.stream()
        .filter(type -> allowed.stream().filter(pokemon -> hasTypeChainType(pokemon, type)).count() >= MIN_TYPE_POKEMON)
        .toList();
  }

  /** Lo que aún se puede nombrar en la cadena: del pool, con el tipo de la cadena y sin usar. */
  public static List<Pokemon> getValidTypeChainCandidates(String chainType, List<Pokemon> allowedPokemon,
      Collection<String> usedPokemonIds) {
    return allowedPokemon.stream()
        .filter(candidate -> !usedPokemonIds.contains(candidate.id()) && hasTypeChainType(candidate, chainType))
        .toList();
  }

  static TypeChainPlayerStats statsOf(TypeChainState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? TypeChainPlayerStats.ZERO : stats;
  }

  /** Cuánto aguantó: los que siguen en pie, por encima de todos; entre los eliminados, el que cayó más tarde. */
  private static int survival(TypeChainState state, String playerId) {
    for (var entry : state.eliminations()) {
      if (entry.playerId().equals(playerId)) return entry.eliminationOrder();
    }
    return state.eliminations().size() + 1;
  }

  /**
   * Más Pokémon nombrados, luego quien aguantó más, luego menos intentos que no valieron y por último el id. El
   * {@code localeCompare} de TS sobre ids de jugador es aquí {@link String#compareTo}, equivalente para los ids del
   * servidor (cuid y {@code guest_<uuid>}; ver el README de motores).
   */
  static int rankingCompare(TypeChainState state, String left, String right) {
    var a = statsOf(state, left);
    var b = statsOf(state, right);
    int bySubmissions = Integer.compare(b.validSubmissions(), a.validSubmissions());
    if (bySubmissions != 0) return bySubmissions;
    int bySurvival = Integer.compare(survival(state, right), survival(state, left));
    if (bySurvival != 0) return bySurvival;
    int byInvalid = Integer.compare(a.invalidAttempts(), b.invalidAttempts());
    return byInvalid != 0 ? byInvalid : left.compareTo(right);
  }

  private static boolean tied(TypeChainState state, String left, String right) {
    var a = statsOf(state, left);
    var b = statsOf(state, right);
    return a.validSubmissions() == b.validSubmissions() && survival(state, left) == survival(state, right)
        && a.invalidAttempts() == b.invalidAttempts();
  }

  public static List<RankedPlayer> typeChainRanking(TypeChainState state) {
    var ordered = new ArrayList<>(state.playerIds());
    ordered.sort((a, b) -> rankingCompare(state, a, b));
    String prior = null;
    int position = 0;
    var ranking = new ArrayList<RankedPlayer>();
    for (int index = 0; index < ordered.size(); index++) {
      var playerId = ordered.get(index);
      if (prior == null || !tied(state, prior, playerId)) position = index + 1;
      prior = playerId;
      ranking.add(new RankedPlayer(playerId, position));
    }
    return ranking;
  }

  /** Ganador: el primero de la clasificación si no comparte el puesto. */
  public static @Nullable String typeChainWinner(TypeChainState state) {
    var ranking = typeChainRanking(state);
    if (ranking.isEmpty()) return null;
    return ranking.size() > 1 && ranking.get(1).position() == 1 ? null : ranking.getFirst().playerId();
  }

  public static GameResults buildTypeChainResults(TypeChainState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
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
