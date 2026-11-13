package es.pokemonuniverse.domain.game.engines.oddoneout;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutBoards.Board;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CategoryDefinition;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code odd-one-out/types.ts}, con los mismos
 * nombres y el mismo orden de claves. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class OddOneOutTypes {

  private OddOneOutTypes() {}

  /** {@code ODD_ONE_OUT_OPTION_IDS}: una letra por cada uno de los cuatro Pokémon del tablero. */
  public static final List<String> OPTION_IDS = List.of("A", "B", "C", "D");

  /** {@code OddOneOutOption}: lo que ve el cliente de cada Pokémon del tablero. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OddOneOutOption(String id, String pokemonId, String pokemonName, String sprite) {

    /** Tres textos contiguos: fuera de este record se construye solo desde el Pokémon. */
    public static OddOneOutOption of(String id, Pokemon pokemon) {
      return new OddOneOutOption(id, pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  /** {@code OddOneOutCategory}: la categoría secreta, que solo se publica al revelar la ronda. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OddOneOutCategory(String id, String label, String explanation) {

    /** Tres textos contiguos: fuera de este record se construye solo desde la definición del catálogo. */
    public static OddOneOutCategory of(CategoryDefinition definition) {
      return new OddOneOutCategory(definition.id(), definition.label(), definition.explanation());
    }
  }

  /** {@code OddOneOutVote}: la opción elegida y la hora autoritativa del voto. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OddOneOutVote(String optionId, long votedAt) {}

  /** {@code OddOneOutRoundResult}: la revelación de una ronda ya cerrada. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OddOneOutRoundResult(int roundNumber, String intruderOptionId, OddOneOutCategory category,
      Map<String, OddOneOutVote> votes, Map<String, Integer> points) {

    public OddOneOutRoundResult {
      votes = frozenMap(votes);
      points = frozenMap(points);
    }
  }

  /** {@code OddOneOutPlayerState}: si aún puede votar y su propio voto. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OddOneOutPlayerState(boolean canVote, @Nullable OddOneOutVote vote) {}

  /** Estadísticas acumuladas de un jugador: votos emitidos y aciertos. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OddOneOutPlayerStats(int votes, int correctVotes) {

    public static final OddOneOutPlayerStats ZERO = new OddOneOutPlayerStats(0, 0);

    /** Las estadísticas tras un voto más, acertado o no. */
    public OddOneOutPlayerStats afterVote(boolean correct) {
      return new OddOneOutPlayerStats(votes + 1, correctVotes + (correct ? 1 : 0));
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. {@code board} lleva el intruso y la categoría de
   * la ronda en curso. Se construye solo con {@link #builder()} o {@link #toBuilder()}.
   */
  public record OddOneOutState(
      GamePhase phase,
      OddOneOutConfig config,
      List<String> playerIds,
      int roundNumber,
      @Nullable Board board,
      List<String> usedCategoryIds,
      List<String> usedPokemonIds,
      Map<String, OddOneOutVote> votes,
      Map<String, Integer> scores,
      Map<String, OddOneOutPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable OddOneOutRoundResult lastRound) implements TimedGameState {

    public OddOneOutState {
      playerIds = frozenList(playerIds);
      usedCategoryIds = frozenList(usedCategoryIds);
      usedPokemonIds = frozenList(usedPokemonIds);
      votes = frozenMap(votes);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).roundNumber(roundNumber).board(board)
          .usedCategoryIds(usedCategoryIds).usedPokemonIds(usedPokemonIds).votes(votes).scores(scores)
          .playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** Fin de la partida: {@code GAME_RESULTS} sin plazos pendientes. */
    public OddOneOutState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase} y {@code config}. */
    public static final class Builder {
      private GamePhase phase;
      private OddOneOutConfig config;
      private List<String> playerIds = List.of();
      private int roundNumber;
      private Board board;
      private List<String> usedCategoryIds = List.of();
      private List<String> usedPokemonIds = List.of();
      private Map<String, OddOneOutVote> votes = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, OddOneOutPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private OddOneOutRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(OddOneOutConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder board(@Nullable Board value) { board = value; return this; }

      public Builder usedCategoryIds(List<String> value) { usedCategoryIds = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder votes(Map<String, OddOneOutVote> value) { votes = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, OddOneOutPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable OddOneOutRoundResult value) { lastRound = value; return this; }

      public OddOneOutState build() {
        return new OddOneOutState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, roundNumber, board, usedCategoryIds, usedPokemonIds, votes, scores, playerStats,
            roundStartedAt, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /** {@code oddOneOutActionSchema}: {@code { type: 'VOTE', optionId: 'A'…'D' }} estricto. */
  public record OddOneOutAction(String optionId) {

    private static final Set<String> KEYS = Set.of("type", "optionId");

    public static OddOneOutAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"VOTE".equals(type.getStringValue())) throw invalid();
      var optionId = raw.get("optionId");
      if (optionId == null || !optionId.isString() || !OPTION_IDS.contains(optionId.getStringValue())) {
        throw invalid();
      }
      return new OddOneOutAction(optionId.getStringValue());
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de El Intruso no válida.");
    }
  }

  /**
   * {@code OddOneOutPublicState}. Durante {@code ROUND_ACTIVE} no lleva el intruso, la categoría ni los votos ajenos
   * (solo {@code votedPlayerIds}). Trece componentes: se construye con {@link #builder()}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OddOneOutPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      List<String> playerIds,
      List<OddOneOutOption> options,
      List<String> votedPlayerIds,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable OddOneOutRoundResult lastRound,
      @Nullable GameResults results) {

    public OddOneOutPublicState {
      playerIds = frozenList(playerIds);
      options = frozenList(options);
      votedPlayerIds = frozenList(votedPlayerIds);
      scores = frozenMap(scores);
    }

    public static Builder builder() {
      return new Builder();
    }

    /** Setters con nombre; {@link #build()} exige {@code gameId} y {@code phase}. */
    public static final class Builder {
      private String gameId;
      private GamePhase phase;
      private int roundNumber;
      private int totalRounds;
      private List<String> playerIds = List.of();
      private List<OddOneOutOption> options = List.of();
      private List<String> votedPlayerIds = List.of();
      private Map<String, Integer> scores = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private OddOneOutRoundResult lastRound;
      private GameResults results;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder totalRounds(int value) { totalRounds = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder options(List<OddOneOutOption> value) { options = value; return this; }

      public Builder votedPlayerIds(List<String> value) { votedPlayerIds = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable OddOneOutRoundResult value) { lastRound = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public OddOneOutPublicState build() {
        return new OddOneOutPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), roundNumber, totalRounds, playerIds, options, votedPlayerIds,
            scores, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound, results);
      }
    }
  }
}
