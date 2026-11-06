package es.pokemonuniverse.domain.game.engines.pokemonimpostor;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorRole;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorWinner;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** Traducción literal de {@code pokemon-impostor/rules.ts}. */
public final class PokemonImpostorRules {

  /** {@code IMPOSTOR_MAX_VOTING_ROUNDS}: solo una revotación; un empate en la segunda es {@code DEADLOCK}. */
  public static final int IMPOSTOR_MAX_VOTING_ROUNDS = 2;
  /** {@code IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION}: rondas seguidas sin expulsión que dan {@code STALEMATE}. */
  public static final int IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION = 3;
  /** {@code IMPOSTOR_CLUE_MAX_CODE_POINTS}: longitud máxima de una pista en puntos de código. */
  public static final int IMPOSTOR_CLUE_MAX_CODE_POINTS = 25;

  private static final Pattern MARKS = Pattern.compile("\\p{M}");
  private static final Pattern NON_LETTERS = Pattern.compile("[^\\p{L}]");

  private PokemonImpostorRules() {}

  /**
   * Solo las letras, sin tildes y en minúsculas: NFD, sin marcas combinantes ({@code \\p{M}}), {@link Locale#ROOT} y
   * fuera todo lo que no es {@code \\p{L}}. La misma normalización que {@code validateImpostorClue} del cliente.
   */
  public static String lettersOnly(String value) {
    var decomposed = MARKS.matcher(Normalizer.normalize(value, Normalizer.Form.NFD)).replaceAll("");
    return NON_LETTERS.matcher(decomposed.toLowerCase(Locale.ROOT)).replaceAll("");
  }

  /**
   * La pista contiene, como subcadena sobre solo letras, el nombre del secreto: {@code name} y los {@code names} es y
   * en que sean texto (en las formas regionales {@code name} es «Raichu de Alola» y {@code names}, «Raichu»). Los
   * nombres que quedan vacíos se descartan: la cadena vacía está contenida en cualquier pista. Un nombre corto bloquea
   * palabras que lo contienen («cabra» con Abra): falso positivo aceptado, el jugador reformula.
   */
  public static boolean mentionsSecret(String clue, Pokemon secret) {
    var letters = lettersOnly(clue);
    var names = secret.names();
    return Stream.of(secret.name(), names == null ? null : names.get("es"), names == null ? null : names.get("en"))
        .filter(String.class::isInstance)
        .map(name -> lettersOnly((String) name))
        .anyMatch(name -> !name.isEmpty() && letters.contains(name));
  }

  /** Sin impostores vivos ganan los inocentes; con tantos impostores como inocentes, los impostores. */
  public static @Nullable ImpostorWinner impostorWinner(List<String> aliveIds, Map<String, ImpostorRole> roles) {
    long impostors = aliveIds.stream().filter(id -> roles.get(id) == ImpostorRole.IMPOSTOR).count();
    long innocents = aliveIds.size() - impostors;
    if (impostors == 0) return ImpostorWinner.INNOCENTS;
    if (impostors >= innocents) return ImpostorWinner.IMPOSTORS;
    return null;
  }

  /**
   * Los demás impostores, en el orden de {@code playerIds}, o {@code null} si {@code playerId} no es impostor o no
   * tiene compañeros. Depende solo de los roles repartidos: no cambia durante la partida.
   */
  public static @Nullable List<String> fellowImpostorIds(PokemonImpostorState state, String playerId) {
    if (state.roles().get(playerId) != ImpostorRole.IMPOSTOR) return null;
    var fellows = state.playerIds().stream()
        .filter(id -> !id.equals(playerId) && state.roles().get(id) == ImpostorRole.IMPOSTOR).toList();
    return fellows.isEmpty() ? null : fellows;
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
