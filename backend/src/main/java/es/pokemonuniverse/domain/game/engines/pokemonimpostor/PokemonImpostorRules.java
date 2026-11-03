package es.pokemonuniverse.domain.game.engines.pokemonimpostor;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorRole;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorWinner;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorState;
import io.micronaut.core.annotation.Nullable;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Traducción literal de {@code pokemon-impostor/rules.ts}. */
public final class PokemonImpostorRules {

  /** {@code IMPOSTOR_MAX_VOTING_ROUNDS}: solo una revotación; un empate en la segunda es {@code DEADLOCK}. */
  public static final int IMPOSTOR_MAX_VOTING_ROUNDS = 2;
  /** {@code IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION}: rondas seguidas sin expulsión que dan {@code STALEMATE}. */
  public static final int IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION = 3;
  /** {@code IMPOSTOR_CLUE_MAX_CODE_POINTS}: longitud máxima de una pista en puntos de código. */
  public static final int IMPOSTOR_CLUE_MAX_CODE_POINTS = 25;

  private PokemonImpostorRules() {}

  /** Sin impostores vivos ganan los inocentes; con tantos impostores como inocentes, los impostores. */
  public static @Nullable ImpostorWinner impostorWinner(List<String> aliveIds, Map<String, ImpostorRole> roles) {
    long impostors = aliveIds.stream().filter(id -> roles.get(id) == ImpostorRole.IMPOSTOR).count();
    long innocents = aliveIds.size() - impostors;
    if (impostors == 0) return ImpostorWinner.INNOCENTS;
    if (impostors >= innocents) return ImpostorWinner.IMPOSTORS;
    return null;
  }

  /**
   * Gana todo el equipo ganador (posición 1, un punto), incluidos los expulsados. El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor (ver el
   * README de motores). {@code winnerId} solo existe si el equipo ganador tiene un único jugador.
   */
  public static GameResults buildPokemonImpostorResults(PokemonImpostorState state) {
    if (state.phase() != GamePhase.GAME_RESULTS || state.winnerTeam() == null) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var winners = state.playerIds().stream()
        .filter(id -> (state.winnerTeam() == ImpostorWinner.IMPOSTORS)
            == (state.roles().get(id) == ImpostorRole.IMPOSTOR))
        .toList();
    var standings = state.playerIds().stream()
        .map(playerId -> standing(state, playerId, winners.contains(playerId)))
        .sorted(Comparator.comparingInt(GameStanding::position).thenComparing(GameStanding::playerId))
        .toList();
    return new GameResults(winners.size() == 1 ? winners.getFirst() : null, standings);
  }

  private static GameStanding standing(PokemonImpostorState state, String playerId, boolean won) {
    var stats = state.playerStats().getOrDefault(playerId, ImpostorPlayerStats.ZERO);
    boolean wasImpostor = state.roles().get(playerId) == ImpostorRole.IMPOSTOR;
    var guess = state.guessAttempts().get(playerId);
    Map<String, Number> mapped = new LinkedHashMap<>();
    mapped.put("cluesSubmitted", stats.cluesSubmitted());
    mapped.put("votesCast", stats.votesCast());
    mapped.put("wasImpostor", wasImpostor ? 1 : 0);
    mapped.put("survived", state.aliveIds().contains(playerId) ? 1 : 0);
    mapped.put("playedAsInnocent", wasImpostor ? 0 : 1);
    mapped.put("wonAsInnocent", !wasImpostor && won ? 1 : 0);
    mapped.put("playedAsImpostor", wasImpostor ? 1 : 0);
    mapped.put("wonAsImpostor", wasImpostor && won ? 1 : 0);
    mapped.put("pokemonGuessed", guess != null && guess.correct() ? 1 : 0);
    return new GameStanding(playerId, won ? 1 : 2, won ? 1 : 0, won, mapped);
  }
}
