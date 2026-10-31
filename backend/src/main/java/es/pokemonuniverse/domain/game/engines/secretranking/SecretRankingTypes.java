package es.pokemonuniverse.domain.game.engines.secretranking;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code secret-ranking/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}. Las distancias y las
 * posiciones medias son {@code double}, como los {@code number} de JS.
 */
public final class SecretRankingTypes {

  private SecretRankingTypes() {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretRankingPokemon(String id, String name, String sprite) {}

  /** {@code SecretRankingPlayerStats}; los contadores contiguos se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretRankingPlayerStats(int roundsPlayed, int rankingsSubmitted, int roundsMissed, int roundWins,
      int perfectMatches, double distanceTotal, int pointsFromRounds) {

    /** {@code emptySecretRankingStats()}. */
    public static final SecretRankingPlayerStats ZERO = new SecretRankingPlayerStats(0, 0, 0, 0, 0, 0, 0);

    /** Cierre de ronda de {@code finishRound}; {@code result} es nulo sin distancia (menos de dos rankings). */
    SecretRankingPlayerStats afterRound(boolean submitted, @Nullable SecretRankingRules.RankingDistance result) {
      return new SecretRankingPlayerStats(roundsPlayed + 1, rankingsSubmitted + (submitted ? 1 : 0),
          roundsMissed + (submitted ? 0 : 1), roundWins + (result != null && result.position() == 1 ? 1 : 0),
          perfectMatches + (result != null && result.distance() == 0 ? 1 : 0),
          distanceTotal + (result != null ? result.distance() : 0),
          pointsFromRounds + (result != null ? result.points() : 0));
    }

    /** {@code { ...stats }} para la clasificación, en el orden de claves de TS. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsPlayed", roundsPlayed);
      mapped.put("rankingsSubmitted", rankingsSubmitted);
      mapped.put("roundsMissed", roundsMissed);
      mapped.put("roundWins", roundWins);
      mapped.put("perfectMatches", perfectMatches);
      mapped.put("distanceTotal", distanceTotal);
      mapped.put("pointsFromRounds", pointsFromRounds);
      return mapped;
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretRankingRoundPlayerResult(
      @Nullable List<SecretRankingPokemon> ranking,
      @Nullable Double distance,
      @Nullable Integer position,
      int pointsAwarded) {

    public SecretRankingRoundPlayerResult {
      ranking = ranking == null ? null : frozenList(ranking);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretRankingConsensus(SecretRankingPokemon pokemon, double averagePosition) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretRankingRoundResult(
      String prompt,
      List<SecretRankingPokemon> pokemon,
      List<SecretRankingConsensus> consensus,
      Map<String, SecretRankingRoundPlayerResult> players) {

    public SecretRankingRoundResult {
      pokemon = frozenList(pokemon);
      consensus = frozenList(consensus);
      players = frozenMap(players);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record SecretRankingState(
      GamePhase phase,
      SecretRankingConfig config,
      List<String> playerIds,
      List<String> pokemonPoolIds,
      List<SubjectiveCategory> promptPool,
      List<String> usedPokemonIds,
      List<String> usedPromptIds,
      int roundNumber,
      List<String> currentPokemonIds,
      @Nullable String currentPromptId,
      Map<String, List<String>> submissions,
      Map<String, Integer> scores,
      Map<String, SecretRankingPlayerStats> playerStats,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable SecretRankingRoundResult lastRound) implements TimedGameState {

    public SecretRankingState {
      playerIds = frozenList(playerIds);
      pokemonPoolIds = frozenList(pokemonPoolIds);
      promptPool = frozenList(promptPool);
      usedPokemonIds = frozenList(usedPokemonIds);
      usedPromptIds = frozenList(usedPromptIds);
      currentPokemonIds = frozenList(currentPokemonIds);
      var frozenSubmissions = new LinkedHashMap<String, List<String>>();
      submissions.forEach((playerId, ranking) -> frozenSubmissions.put(playerId, frozenList(ranking)));
      submissions = frozenMap(frozenSubmissions);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).pokemonPoolIds(pokemonPoolIds)
          .promptPool(promptPool).usedPokemonIds(usedPokemonIds).usedPromptIds(usedPromptIds).roundNumber(roundNumber)
          .currentPokemonIds(currentPokemonIds).currentPromptId(currentPromptId).submissions(submissions)
          .scores(scores).playerStats(playerStats).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt)
          .lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private SecretRankingConfig config;
      private List<String> playerIds = List.of();
      private List<String> pokemonPoolIds = List.of();
      private List<SubjectiveCategory> promptPool = List.of();
      private List<String> usedPokemonIds = List.of();
      private List<String> usedPromptIds = List.of();
      private int roundNumber;
      private List<String> currentPokemonIds = List.of();
      private String currentPromptId;
      private Map<String, List<String>> submissions = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, SecretRankingPlayerStats> playerStats = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private SecretRankingRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(SecretRankingConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder pokemonPoolIds(List<String> value) { pokemonPoolIds = value; return this; }

      public Builder promptPool(List<SubjectiveCategory> value) { promptPool = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder usedPromptIds(List<String> value) { usedPromptIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder currentPokemonIds(List<String> value) { currentPokemonIds = value; return this; }

      public Builder currentPromptId(@Nullable String value) { currentPromptId = value; return this; }

      public Builder submissions(Map<String, List<String>> value) { submissions = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, SecretRankingPlayerStats> value) { playerStats = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable SecretRankingRoundResult value) { lastRound = value; return this; }

      public SecretRankingState build() {
        return new SecretRankingState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, pokemonPoolIds, promptPool, usedPokemonIds, usedPromptIds, roundNumber, currentPokemonIds,
            currentPromptId, submissions, scores, playerStats, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /**
   * {@code secretRankingActionSchema}: objeto estricto {@code SUBMIT_RANKING} con exactamente cinco ids de 1 a 96
   * unidades UTF-16, y el {@code refine} de cinco ids distintos.
   */
  public record SecretRankingAction(List<String> pokemonIds) {

    private static final Set<String> KEYS = Set.of("type", "pokemonIds");

    public SecretRankingAction {
      pokemonIds = frozenList(pokemonIds);
    }

    static SecretRankingAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !type.getStringValue().equals("SUBMIT_RANKING")) throw invalid();
      var ids = raw.get("pokemonIds");
      if (ids == null || !ids.isArray() || ids.size() != 5) throw invalid();
      var pokemonIds = new ArrayList<String>();
      for (var value : ids.values()) {
        if (!value.isString()) throw invalid();
        var id = value.getStringValue();
        if (id.isEmpty() || id.length() > 96) throw invalid();
        pokemonIds.add(id);
      }
      if (new HashSet<>(pokemonIds).size() != 5) throw invalid();
      return new SecretRankingAction(pokemonIds);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Secret Ranking no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretRankingPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      String prompt,
      List<SecretRankingPokemon> pokemon,
      List<String> submittedPlayerIds,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable SecretRankingRoundResult lastRound,
      @Nullable GameResults results) {}

  /** Las dos variantes de TS ({@code PLAYER}/{@code SPECTATOR}) tienen las mismas claves: un único record. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretRankingPlayerState(String role, boolean canSubmit,
      @Nullable List<SecretRankingPokemon> ownRanking) {

    static final SecretRankingPlayerState SPECTATOR = new SecretRankingPlayerState("SPECTATOR", false, null);
  }
}
