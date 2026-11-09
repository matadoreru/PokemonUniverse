package es.pokemonuniverse.domain.game.engines.absurdpokedex;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code absurd-pokedex/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class AbsurdPokedexTypes {

  private AbsurdPokedexTypes() {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexPokemon(String id, String name, String sprite, int nationalDexNumber, List<String> types) {

    public AbsurdPokedexPokemon {
      types = frozenList(types);
    }
  }

  /** Una entrada anónima durante la votación: sin autor ni indicio de si es la oficial. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexEntryView(String id, String text) {}

  /**
   * Entrada de la ronda, interna del estado: nunca sale en una proyección antes de los resultados. {@code authorId}
   * es {@code null} en la oficial.
   */
  public record AbsurdPokedexEntry(String id, String text, @Nullable String authorId, boolean isReal) {}

  /** La entrada oficial elegida para la ronda, interna del estado ({@code { text, versionLabel }}). */
  public record AbsurdPokedexRealEntry(String text, String versionLabel) {}

  /** {@code realEntry} de {@code AbsurdPokedexRoundResult}: {@code { id, versionLabel }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexRealEntryRef(String id, String versionLabel) {}

  /** Entrada de los resultados de ronda; {@code authorId} es {@code null} en la oficial. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexEntryResult(
      String id,
      String text,
      @Nullable String authorId,
      boolean isReal,
      int votesReceived,
      int funnyVotesReceived,
      List<String> votedBy,
      List<String> funnyVotedBy) {

    public AbsurdPokedexEntryResult {
      votedBy = frozenList(votedBy);
      funnyVotedBy = frozenList(funnyVotedBy);
    }

    public static Builder builder() {
      return new Builder();
    }

    public static final class Builder {
      private String id;
      private String text;
      private String authorId;
      private boolean isReal;
      private int votesReceived;
      private int funnyVotesReceived;
      private List<String> votedBy = List.of();
      private List<String> funnyVotedBy = List.of();

      private Builder() {}

      public Builder id(String value) { id = value; return this; }

      public Builder text(String value) { text = value; return this; }

      public Builder authorId(@Nullable String value) { authorId = value; return this; }

      public Builder isReal(boolean value) { isReal = value; return this; }

      public Builder votesReceived(int value) { votesReceived = value; return this; }

      public Builder funnyVotesReceived(int value) { funnyVotesReceived = value; return this; }

      public Builder votedBy(List<String> value) { votedBy = value; return this; }

      public Builder funnyVotedBy(List<String> value) { funnyVotedBy = value; return this; }

      public AbsurdPokedexEntryResult build() {
        return new AbsurdPokedexEntryResult(Objects.requireNonNull(id, "id"), Objects.requireNonNull(text, "text"),
            authorId, isReal, votesReceived, funnyVotesReceived, votedBy, funnyVotedBy);
      }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexRoundResult(
      AbsurdPokedexMode mode,
      AbsurdPokedexPokemon pokemon,
      boolean skipped,
      List<AbsurdPokedexEntryResult> entries,
      @Nullable AbsurdPokedexRealEntryRef realEntry,
      List<String> winnerPlayerIds,
      Map<String, Integer> pointsAwarded,
      List<String> missingPlayerIds) {

    public AbsurdPokedexRoundResult {
      entries = frozenList(entries);
      winnerPlayerIds = frozenList(winnerPlayerIds);
      pointsAwarded = frozenMap(pointsAwarded);
      missingPlayerIds = frozenList(missingPlayerIds);
    }

    public static Builder builder() {
      return new Builder();
    }

    public static final class Builder {
      private AbsurdPokedexMode mode;
      private AbsurdPokedexPokemon pokemon;
      private boolean skipped;
      private List<AbsurdPokedexEntryResult> entries = List.of();
      private AbsurdPokedexRealEntryRef realEntry;
      private List<String> winnerPlayerIds = List.of();
      private Map<String, Integer> pointsAwarded = Map.of();
      private List<String> missingPlayerIds = List.of();

      private Builder() {}

      public Builder mode(AbsurdPokedexMode value) { mode = value; return this; }

      public Builder pokemon(AbsurdPokedexPokemon value) { pokemon = value; return this; }

      public Builder skipped(boolean value) { skipped = value; return this; }

      public Builder entries(List<AbsurdPokedexEntryResult> value) { entries = value; return this; }

      public Builder realEntry(@Nullable AbsurdPokedexRealEntryRef value) { realEntry = value; return this; }

      public Builder winnerPlayerIds(List<String> value) { winnerPlayerIds = value; return this; }

      public Builder pointsAwarded(Map<String, Integer> value) { pointsAwarded = value; return this; }

      public Builder missingPlayerIds(List<String> value) { missingPlayerIds = value; return this; }

      public AbsurdPokedexRoundResult build() {
        return new AbsurdPokedexRoundResult(Objects.requireNonNull(mode, "mode"),
            Objects.requireNonNull(pokemon, "pokemon"), skipped, entries, realEntry, winnerPlayerIds, pointsAwarded,
            missingPlayerIds);
      }
    }
  }

  /**
   * {@code AbsurdPokedexPlayerStats}: ocho contadores contiguos, que se derivan con el builder
   * ({@link #toBuilder()}), nunca por posición.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexPlayerStats(
      int roundsPlayed,
      int entriesSubmitted,
      int votesReceived,
      int funnyVotesReceived,
      int roundWins,
      int realGuessed,
      int playersFooled,
      int pointsFromRounds) {

    /** Estadísticas vacías de un jugador que aún no ha jugado. */
    public static final AbsurdPokedexPlayerStats ZERO = new AbsurdPokedexPlayerStats(0, 0, 0, 0, 0, 0, 0, 0);

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().roundsPlayed(roundsPlayed).entriesSubmitted(entriesSubmitted)
          .votesReceived(votesReceived).funnyVotesReceived(funnyVotesReceived).roundWins(roundWins)
          .realGuessed(realGuessed).playersFooled(playersFooled).pointsFromRounds(pointsFromRounds);
    }

    /** {@code { ...stats }} para la clasificación, en el orden de claves de TS. */
    public Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsPlayed", roundsPlayed);
      mapped.put("entriesSubmitted", entriesSubmitted);
      mapped.put("votesReceived", votesReceived);
      mapped.put("funnyVotesReceived", funnyVotesReceived);
      mapped.put("roundWins", roundWins);
      mapped.put("realGuessed", realGuessed);
      mapped.put("playersFooled", playersFooled);
      mapped.put("pointsFromRounds", pointsFromRounds);
      return mapped;
    }

    public static final class Builder {
      private int roundsPlayed;
      private int entriesSubmitted;
      private int votesReceived;
      private int funnyVotesReceived;
      private int roundWins;
      private int realGuessed;
      private int playersFooled;
      private int pointsFromRounds;

      private Builder() {}

      public Builder roundsPlayed(int value) { roundsPlayed = value; return this; }

      public Builder entriesSubmitted(int value) { entriesSubmitted = value; return this; }

      public Builder votesReceived(int value) { votesReceived = value; return this; }

      public Builder funnyVotesReceived(int value) { funnyVotesReceived = value; return this; }

      public Builder roundWins(int value) { roundWins = value; return this; }

      public Builder realGuessed(int value) { realGuessed = value; return this; }

      public Builder playersFooled(int value) { playersFooled = value; return this; }

      public Builder pointsFromRounds(int value) { pointsFromRounds = value; return this; }

      public AbsurdPokedexPlayerStats build() {
        return new AbsurdPokedexPlayerStats(roundsPlayed, entriesSubmitted, votesReceived, funnyVotesReceived,
            roundWins, realGuessed, playersFooled, pointsFromRounds);
      }
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}. {@code submissions} es de jugador a texto enviado; {@code votes} y {@code funnyVotes}, de
   * votante a id de entrada.
   */
  public record AbsurdPokedexState(
      GamePhase phase,
      AbsurdPokedexConfig config,
      List<String> playerIds,
      List<String> pokemonDeckIds,
      int roundNumber,
      @Nullable AbsurdPokedexPokemon currentPokemon,
      @Nullable AbsurdPokedexRealEntry realEntry,
      Map<String, String> drafts,
      Map<String, String> submissions,
      List<AbsurdPokedexEntry> entries,
      Map<String, String> votes,
      Map<String, String> funnyVotes,
      Map<String, Integer> scores,
      Map<String, AbsurdPokedexPlayerStats> playerStats,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable AbsurdPokedexRoundResult lastRound) implements TimedGameState {

    public AbsurdPokedexState {
      playerIds = frozenList(playerIds);
      pokemonDeckIds = frozenList(pokemonDeckIds);
      drafts = frozenMap(drafts);
      submissions = frozenMap(submissions);
      entries = frozenList(entries);
      votes = frozenMap(votes);
      funnyVotes = frozenMap(funnyVotes);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).pokemonDeckIds(pokemonDeckIds)
          .roundNumber(roundNumber).currentPokemon(currentPokemon).realEntry(realEntry).drafts(drafts)
          .submissions(submissions).entries(entries).votes(votes).funnyVotes(funnyVotes).scores(scores)
          .playerStats(playerStats).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private AbsurdPokedexConfig config;
      private List<String> playerIds = List.of();
      private List<String> pokemonDeckIds = List.of();
      private int roundNumber;
      private AbsurdPokedexPokemon currentPokemon;
      private AbsurdPokedexRealEntry realEntry;
      private Map<String, String> drafts = Map.of();
      private Map<String, String> submissions = Map.of();
      private List<AbsurdPokedexEntry> entries = List.of();
      private Map<String, String> votes = Map.of();
      private Map<String, String> funnyVotes = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, AbsurdPokedexPlayerStats> playerStats = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private AbsurdPokedexRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(AbsurdPokedexConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder pokemonDeckIds(List<String> value) { pokemonDeckIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder currentPokemon(@Nullable AbsurdPokedexPokemon value) { currentPokemon = value; return this; }

      public Builder realEntry(@Nullable AbsurdPokedexRealEntry value) { realEntry = value; return this; }

      public Builder drafts(Map<String, String> value) { drafts = value; return this; }

      public Builder submissions(Map<String, String> value) { submissions = value; return this; }

      public Builder entries(List<AbsurdPokedexEntry> value) { entries = value; return this; }

      public Builder votes(Map<String, String> value) { votes = value; return this; }

      public Builder funnyVotes(Map<String, String> value) { funnyVotes = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, AbsurdPokedexPlayerStats> value) { playerStats = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable AbsurdPokedexRoundResult value) { lastRound = value; return this; }

      public AbsurdPokedexState build() {
        return new AbsurdPokedexState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, pokemonDeckIds, roundNumber, currentPokemon, realEntry, drafts, submissions, entries, votes,
            funnyVotes, scores, playerStats, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /**
   * {@code absurdPokedexActionSchema}: unión discriminada por {@code type}, cada variante estricta. Las longitudes son
   * en unidades UTF-16 ({@code string.length}). {@code SUBMIT_ABSURD_ENTRY} recorta el texto con el {@code trim} de JS
   * ({@link JsStrings#trim}) antes de comprobar {@code min(1)}/{@code max(150)}, y la acción lleva el texto
   * recortado; el borrador no se recorta. En {@code VOTE_ABSURD}, {@code funnyEntryId} es opcional: ausente es
   * {@code null}, y un {@code null} explícito se rechaza como {@code .optional()} de Zod.
   */
  public sealed interface AbsurdPokedexAction {

    record UpdateDraft(String text) implements AbsurdPokedexAction {}

    record SubmitEntry(String text) implements AbsurdPokedexAction {}

    record Vote(String entryId, @Nullable String funnyEntryId) implements AbsurdPokedexAction {}

    static AbsurdPokedexAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "UPDATE_ABSURD_DRAFT" -> {
          strict(raw, Set.of("type", "text"));
          var text = string(raw, "text");
          if (text.length() > AbsurdPokedexRules.MAX_ENTRY_LENGTH) throw tooLong();
          yield new UpdateDraft(text);
        }
        case "SUBMIT_ABSURD_ENTRY" -> {
          strict(raw, Set.of("type", "text"));
          var text = JsStrings.trim(string(raw, "text"));
          if (text.isEmpty()) throw new ConfigValidationException("Escribe una entrada antes de enviarla.");
          if (text.length() > AbsurdPokedexRules.MAX_ENTRY_LENGTH) throw tooLong();
          yield new SubmitEntry(text);
        }
        case "VOTE_ABSURD" -> {
          strict(raw, Set.of("type", "entryId", "funnyEntryId"));
          var entryId = id(raw, "entryId");
          yield new Vote(entryId, raw.get("funnyEntryId") == null ? null : id(raw, "funnyEntryId"));
        }
        default -> throw invalid();
      };
    }

    private static String id(JsonNode raw, String key) {
      var value = string(raw, key);
      if (value.isEmpty() || value.length() > 96) throw invalid();
      return value;
    }

    private static String string(JsonNode raw, String key) {
      var value = raw.get(key);
      if (value == null || !value.isString()) throw invalid();
      return value.getStringValue();
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException tooLong() {
      return new ConfigValidationException(
          "La entrada no puede superar " + AbsurdPokedexRules.MAX_ENTRY_LENGTH + " caracteres.");
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokédex Absurda no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexPublicState(
      String gameId,
      GamePhase phase,
      AbsurdPokedexMode mode,
      int roundNumber,
      int totalRounds,
      @Nullable AbsurdPokedexPokemon pokemon,
      List<String> playerIds,
      List<String> submittedPlayerIds,
      List<String> votedPlayerIds,
      List<AbsurdPokedexEntryView> entries,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable AbsurdPokedexRoundResult lastRound,
      @Nullable GameResults results) {

    public AbsurdPokedexPublicState {
      playerIds = frozenList(playerIds);
      submittedPlayerIds = frozenList(submittedPlayerIds);
      votedPlayerIds = frozenList(votedPlayerIds);
      entries = frozenList(entries);
      scores = frozenMap(scores);
    }

    public static Builder builder() {
      return new Builder();
    }

    public static final class Builder {
      private String gameId;
      private GamePhase phase;
      private AbsurdPokedexMode mode;
      private int roundNumber;
      private int totalRounds;
      private AbsurdPokedexPokemon pokemon;
      private List<String> playerIds = List.of();
      private List<String> submittedPlayerIds = List.of();
      private List<String> votedPlayerIds = List.of();
      private List<AbsurdPokedexEntryView> entries = List.of();
      private Map<String, Integer> scores = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private AbsurdPokedexRoundResult lastRound;
      private GameResults results;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder mode(AbsurdPokedexMode value) { mode = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder totalRounds(int value) { totalRounds = value; return this; }

      public Builder pokemon(@Nullable AbsurdPokedexPokemon value) { pokemon = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder submittedPlayerIds(List<String> value) { submittedPlayerIds = value; return this; }

      public Builder votedPlayerIds(List<String> value) { votedPlayerIds = value; return this; }

      public Builder entries(List<AbsurdPokedexEntryView> value) { entries = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable AbsurdPokedexRoundResult value) { lastRound = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public AbsurdPokedexPublicState build() {
        return new AbsurdPokedexPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(mode, "mode"), roundNumber, totalRounds,
            pokemon, playerIds, submittedPlayerIds, votedPlayerIds, entries, scores, roundEndsAt, nextTransitionAt,
            lastRound, results);
      }
    }
  }

  /** {@code ownEntry}: la entrada propia ({@code id} es {@code null} hasta que se baraja en la votación). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexOwnEntry(@Nullable String id, String text) {}

  /** Las dos variantes de TS ({@code PLAYER}/{@code SPECTATOR}) tienen las mismas claves: un único record. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record AbsurdPokedexPlayerState(
      String role,
      boolean canSubmit,
      String ownDraft,
      @Nullable AbsurdPokedexOwnEntry ownEntry,
      boolean canVote,
      @Nullable String ownVoteEntryId,
      @Nullable String ownFunnyEntryId) {

    static final AbsurdPokedexPlayerState SPECTATOR =
        new AbsurdPokedexPlayerState("SPECTATOR", false, "", null, false, null, null);
  }
}
