package es.pokemonuniverse.domain.game.engines.whoiswhopokemon;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

/**
 * Tipos de {@code who-is-who-pokemon/types.ts}. Los {@code Record<WhoIsWhoTeam, …>} son records con un componente por
 * equipo, serializados como {@code BLUE} y luego {@code RED} (el orden de {@code teams} en {@code server.ts}).
 */
public final class WhoIsWhoPokemonTypes {

  private WhoIsWhoPokemonTypes() {}

  /** {@code WhoIsWhoTeam}, en el orden de {@code teams} de {@code server.ts}. */
  public enum WhoIsWhoTeam {
    BLUE, RED;

    WhoIsWhoTeam rival() {
      return this == BLUE ? RED : BLUE;
    }
  }

  public enum WhoIsWhoRole { PLAYER, SPECTATOR }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoPokemonCard(String id, int nationalDexNumber, String name, String sprite) {}

  /** {@code WhoIsWhoTeamState}: {@code discardedPokemonIds} conserva el orden de inserción del {@code Set} de TS. */
  public record WhoIsWhoTeamState(List<String> playerIds, @Nullable String secretPokemonId,
      List<String> discardedPokemonIds) {

    public WhoIsWhoTeamState {
      playerIds = frozenList(playerIds);
      discardedPokemonIds = frozenList(discardedPokemonIds);
    }

    WhoIsWhoTeamState withSecret(String pokemonId) {
      return new WhoIsWhoTeamState(playerIds, pokemonId, discardedPokemonIds);
    }

    WhoIsWhoTeamState withDiscarded(List<String> ids) {
      return new WhoIsWhoTeamState(playerIds, secretPokemonId, ids);
    }
  }

  /** {@code Record<WhoIsWhoTeam, WhoIsWhoTeamState>}. */
  public record WhoIsWhoTeams(WhoIsWhoTeamState blue, WhoIsWhoTeamState red) {

    public WhoIsWhoTeams {
      Objects.requireNonNull(blue, "blue");
      Objects.requireNonNull(red, "red");
    }

    public WhoIsWhoTeamState get(WhoIsWhoTeam team) {
      return team == WhoIsWhoTeam.BLUE ? blue : red;
    }

    /** {@code { ...teams, [team]: value }}. */
    WhoIsWhoTeams with(WhoIsWhoTeam team, WhoIsWhoTeamState value) {
      return team == WhoIsWhoTeam.BLUE ? new WhoIsWhoTeams(value, red) : new WhoIsWhoTeams(blue, value);
    }

    /** {@code teams.every((team) => state.teams[team].secretPokemonId !== null)}. */
    boolean allSecretsReady() {
      return blue.secretPokemonId() != null && red.secretPokemonId() != null;
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoGuess(WhoIsWhoTeam team, String playerId, String pokemonId, boolean correct, long attemptedAt,
      int turnNumber) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoStats(int wins, int turnsPlayed, int correctGuesses, int incorrectGuesses) {

    /** {@code emptyWhoIsWhoStats()}. */
    static final WhoIsWhoStats ZERO = new WhoIsWhoStats(0, 0, 0, 0);

    /** {@code { ...stats, wins: stats.wins + 1 }}. */
    WhoIsWhoStats withWin() {
      return new WhoIsWhoStats(wins + 1, turnsPlayed, correctGuesses, incorrectGuesses);
    }

    /** Un intento de adivinar: acierto o fallo y un turno jugado más. */
    WhoIsWhoStats afterGuess(boolean correct) {
      return new WhoIsWhoStats(wins, turnsPlayed + 1, correctGuesses + (correct ? 1 : 0),
          incorrectGuesses + (correct ? 0 : 1));
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record WhoIsWhoState(
      GamePhase phase,
      WhoIsWhoPokemonConfig config,
      List<String> playerIds,
      List<WhoIsWhoPokemonCard> board,
      WhoIsWhoTeams teams,
      WhoIsWhoTeam currentTeam,
      int roundNumber,
      int turnNumber,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      Map<String, Integer> scores,
      Map<String, WhoIsWhoStats> playerStats,
      List<WhoIsWhoGuess> guesses,
      @Nullable WhoIsWhoTeam winnerTeam) {

    public WhoIsWhoState {
      playerIds = frozenList(playerIds);
      board = frozenList(board);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
      guesses = frozenList(guesses);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).board(board).teams(teams)
          .currentTeam(currentTeam).roundNumber(roundNumber).turnNumber(turnNumber).roundStartedAt(roundStartedAt)
          .roundEndsAt(roundEndsAt).scores(scores).playerStats(playerStats).guesses(guesses).winnerTeam(winnerTeam);
    }

    /** Colecciones vacías por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private WhoIsWhoPokemonConfig config;
      private List<String> playerIds = List.of();
      private List<WhoIsWhoPokemonCard> board = List.of();
      private WhoIsWhoTeams teams;
      private WhoIsWhoTeam currentTeam;
      private int roundNumber;
      private int turnNumber;
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Map<String, Integer> scores = Map.of();
      private Map<String, WhoIsWhoStats> playerStats = Map.of();
      private List<WhoIsWhoGuess> guesses = List.of();
      private WhoIsWhoTeam winnerTeam;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(WhoIsWhoPokemonConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder board(List<WhoIsWhoPokemonCard> value) { board = value; return this; }

      public Builder teams(WhoIsWhoTeams value) { teams = value; return this; }

      public Builder currentTeam(WhoIsWhoTeam value) { currentTeam = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder turnNumber(int value) { turnNumber = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, WhoIsWhoStats> value) { playerStats = value; return this; }

      public Builder guesses(List<WhoIsWhoGuess> value) { guesses = value; return this; }

      public Builder winnerTeam(@Nullable WhoIsWhoTeam value) { winnerTeam = value; return this; }

      public WhoIsWhoState build() {
        return new WhoIsWhoState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, board, Objects.requireNonNull(teams, "teams"), Objects.requireNonNull(currentTeam, "currentTeam"),
            roundNumber, turnNumber, roundStartedAt, roundEndsAt, scores, playerStats, guesses, winnerTeam);
      }
    }
  }

  /**
   * {@code whoIsWhoPokemonActionSchema}: unión discriminada por {@code type}, cada variante estricta; {@code pokemonId}
   * tiene de 1 a 96 unidades UTF-16.
   */
  public sealed interface WhoIsWhoPokemonAction {

    record SelectSecret(String pokemonId) implements WhoIsWhoPokemonAction {}

    record ToggleDiscard(String pokemonId) implements WhoIsWhoPokemonAction {}

    record GuessPokemon(String pokemonId) implements WhoIsWhoPokemonAction {}

    record EndTurn() implements WhoIsWhoPokemonAction {}

    static WhoIsWhoPokemonAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "SELECT_SECRET" -> withPokemon(raw, SelectSecret::new);
        case "TOGGLE_DISCARD" -> withPokemon(raw, ToggleDiscard::new);
        case "GUESS_POKEMON" -> withPokemon(raw, GuessPokemon::new);
        case "END_TURN" -> {
          strict(raw, Set.of("type"));
          yield new EndTurn();
        }
        default -> throw invalid();
      };
    }

    private static WhoIsWhoPokemonAction withPokemon(JsonNode raw, Function<String, WhoIsWhoPokemonAction> factory) {
      strict(raw, Set.of("type", "pokemonId"));
      var value = raw.get("pokemonId");
      if (value == null || !value.isString()) throw invalid();
      var id = value.getStringValue();
      if (id.isEmpty() || id.length() > 96) throw invalid();
      return factory.apply(id);
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Quién es Quién — Pokémon no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoPublicTeam(List<String> playerIds, boolean secretReady) {}

  /** {@code teams} público: {@code BLUE} y luego {@code RED}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoPublicTeams(@JsonProperty("BLUE") WhoIsWhoPublicTeam blue,
      @JsonProperty("RED") WhoIsWhoPublicTeam red) {}

  /** {@code revealedSecrets}: {@code BLUE} y luego {@code RED}, {@code null} hasta los resultados. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoRevealedSecrets(@JsonProperty("BLUE") @Nullable WhoIsWhoPokemonCard blue,
      @JsonProperty("RED") @Nullable WhoIsWhoPokemonCard red) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoPublicState(
      String gameId,
      GamePhase phase,
      List<WhoIsWhoPokemonCard> board,
      WhoIsWhoPublicTeams teams,
      WhoIsWhoTeam currentTeam,
      int roundNumber,
      int turnNumber,
      int totalRounds,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      List<WhoIsWhoGuess> guesses,
      @Nullable WhoIsWhoTeam winnerTeam,
      WhoIsWhoRevealedSecrets revealedSecrets,
      @Nullable GameResults results) {}

  /** Orden de claves del literal de {@code getPlayerState} (no el de la interfaz de {@code types.ts}). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoIsWhoPlayerState(
      WhoIsWhoRole role,
      @Nullable WhoIsWhoTeam team,
      @Nullable WhoIsWhoPokemonCard ownSecret,
      List<String> discardedPokemonIds,
      boolean canChooseSecret,
      boolean canManageBoard,
      boolean canAct,
      boolean canGuess,
      boolean guessUsed,
      @Nullable WhoIsWhoGuess lastGuess) {

    /** Cinco booleanos contiguos: se construye por nombre, nunca por posición. */
    static Builder builder() {
      return new Builder();
    }

    static final class Builder {
      private WhoIsWhoRole role;
      private WhoIsWhoTeam team;
      private WhoIsWhoPokemonCard ownSecret;
      private List<String> discardedPokemonIds = List.of();
      private boolean canChooseSecret;
      private boolean canManageBoard;
      private boolean canAct;
      private boolean canGuess;
      private boolean guessUsed;
      private WhoIsWhoGuess lastGuess;

      private Builder() {}

      Builder role(WhoIsWhoRole value) { role = value; return this; }

      Builder team(@Nullable WhoIsWhoTeam value) { team = value; return this; }

      Builder ownSecret(@Nullable WhoIsWhoPokemonCard value) { ownSecret = value; return this; }

      Builder discardedPokemonIds(List<String> value) { discardedPokemonIds = value; return this; }

      Builder canChooseSecret(boolean value) { canChooseSecret = value; return this; }

      Builder canManageBoard(boolean value) { canManageBoard = value; return this; }

      Builder canAct(boolean value) { canAct = value; return this; }

      Builder canGuess(boolean value) { canGuess = value; return this; }

      Builder guessUsed(boolean value) { guessUsed = value; return this; }

      Builder lastGuess(@Nullable WhoIsWhoGuess value) { lastGuess = value; return this; }

      WhoIsWhoPlayerState build() {
        return new WhoIsWhoPlayerState(Objects.requireNonNull(role, "role"), team, ownSecret, discardedPokemonIds,
            canChooseSecret, canManageBoard, canAct, canGuess, guessUsed, lastGuess);
      }
    }
  }
}
