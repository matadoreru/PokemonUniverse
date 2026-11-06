package es.pokemonuniverse.domain.game.engines.poketaboo;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code poke-taboo/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokeTabooTypes {

  private PokeTabooTypes() {}

  /** {@code PokeTabooPlayerStats}: nueve contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooPlayerStats(int guessedPokemon, int firstTry, int totalAttempts, int firstCorrectResponses,
      int descriptorRounds, int descriptorSuccesses, int descriptorFailures, int pointsFromGuessing,
      int pointsFromDescribing) {

    /** {@code emptyPokeTabooStats()}. */
    public static final PokeTabooPlayerStats ZERO = new PokeTabooPlayerStats(0, 0, 0, 0, 0, 0, 0, 0, 0);

    PokeTabooPlayerStats afterAttempt() {
      return new PokeTabooPlayerStats(guessedPokemon, firstTry, totalAttempts + 1, firstCorrectResponses,
          descriptorRounds, descriptorSuccesses, descriptorFailures, pointsFromGuessing, pointsFromDescribing);
    }

    /** Acierto del adivinador: {@code firstTry} solo si fue su primer intento de la ronda. */
    PokeTabooPlayerStats afterGuessed(boolean onFirstTry, int points) {
      return new PokeTabooPlayerStats(guessedPokemon + 1, firstTry + (onFirstTry ? 1 : 0), totalAttempts,
          firstCorrectResponses + 1, descriptorRounds, descriptorSuccesses, descriptorFailures,
          pointsFromGuessing + points, pointsFromDescribing);
    }

    /** Cierre de una ronda como descriptor, con o sin acierto. */
    PokeTabooPlayerStats afterDescriptorRound(boolean success, int points) {
      return new PokeTabooPlayerStats(guessedPokemon, firstTry, totalAttempts, firstCorrectResponses,
          descriptorRounds + 1, descriptorSuccesses + (success ? 1 : 0), descriptorFailures + (success ? 0 : 1),
          pointsFromGuessing, pointsFromDescribing + points);
    }

    /** {@code { ...stats }} para la clasificación, en el orden de claves de TS. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("guessedPokemon", guessedPokemon);
      mapped.put("firstTry", firstTry);
      mapped.put("totalAttempts", totalAttempts);
      mapped.put("firstCorrectResponses", firstCorrectResponses);
      mapped.put("descriptorRounds", descriptorRounds);
      mapped.put("descriptorSuccesses", descriptorSuccesses);
      mapped.put("descriptorFailures", descriptorFailures);
      mapped.put("pointsFromGuessing", pointsFromGuessing);
      mapped.put("pointsFromDescribing", pointsFromDescribing);
      return mapped;
    }
  }

  /** {@code { id, name, sprite }} del Pokémon de un intento. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooGuessedPokemon(String id, String name, String sprite) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooAttempt(String playerId, PokeTabooGuessedPokemon guessedPokemon, long attemptedAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooHint(int id, String text, long sentAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooPokemonReveal(String id, String name, String sprite, int generation, List<String> types) {

    public PokeTabooPokemonReveal {
      types = frozenList(types);
    }

    /** {@code reveal(pokemon)}. */
    static PokeTabooPokemonReveal of(Pokemon pokemon) {
      return new PokeTabooPokemonReveal(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.generation(),
          pokemon.types());
    }
  }

  /** {@code PokeTabooSecretPokemon}: {@code { ...reveal(pokemon), estadísticas, metadatos }}; se crea con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooSecretPokemon(
      String id,
      String name,
      String sprite,
      int generation,
      List<String> types,
      int hp,
      int attack,
      int defense,
      int specialAttack,
      int specialDefense,
      int speed,
      int baseStatTotal,
      @Nullable Integer evolutionStage,
      @Nullable Integer evolutionStageCount,
      @Nullable Integer heightDecimeters,
      @Nullable Integer weightHectograms,
      @Nullable String legendaryStatus,
      List<String> abilities) {

    public PokeTabooSecretPokemon {
      types = frozenList(types);
      abilities = frozenList(abilities);
    }

    /** {@code secret(pokemon)}: los opcionales ausentes salen como {@code null}. */
    static PokeTabooSecretPokemon of(Pokemon pokemon) {
      return new PokeTabooSecretPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.generation(),
          pokemon.types(), pokemon.hp(), pokemon.attack(), pokemon.defense(), pokemon.specialAttack(),
          pokemon.specialDefense(), pokemon.speed(), pokemon.baseStatTotal(), pokemon.evolutionStage(),
          pokemon.evolutionStageCount(), pokemon.heightDecimeters(), pokemon.weightHectograms(),
          pokemon.legendaryStatus(), pokemon.abilities() == null ? List.of() : pokemon.abilities());
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooRoundResult(String reason, PokeTabooPokemonReveal pokemon, String descriptorId,
      @Nullable String winnerId, int guesserPoints, int descriptorPoints, @Nullable Integer winnerAttemptCount) {}

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokeTabooState(
      GamePhase phase,
      PokeTabooConfig config,
      List<String> playerIds,
      List<String> descriptorOrder,
      List<String> poolIds,
      List<String> usedPokemonIds,
      int roundNumber,
      @Nullable String targetPokemonId,
      @Nullable String descriptorId,
      List<PokeTabooHint> hints,
      @Nullable Long hintCooldownUntil,
      List<PokeTabooAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, Long> cooldownUntil,
      Map<String, Integer> scores,
      Map<String, PokeTabooPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokeTabooRoundResult lastRound) implements TimedGameState {

    public PokeTabooState {
      playerIds = frozenList(playerIds);
      descriptorOrder = frozenList(descriptorOrder);
      poolIds = frozenList(poolIds);
      usedPokemonIds = frozenList(usedPokemonIds);
      hints = frozenList(hints);
      attempts = frozenList(attempts);
      attemptCounts = frozenMap(attemptCounts);
      cooldownUntil = frozenMap(cooldownUntil);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).descriptorOrder(descriptorOrder)
          .poolIds(poolIds).usedPokemonIds(usedPokemonIds).roundNumber(roundNumber).targetPokemonId(targetPokemonId)
          .descriptorId(descriptorId).hints(hints).hintCooldownUntil(hintCooldownUntil).attempts(attempts)
          .attemptCounts(attemptCounts).cooldownUntil(cooldownUntil).scores(scores).playerStats(playerStats)
          .roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt)
          .lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokeTabooConfig config;
      private List<String> playerIds = List.of();
      private List<String> descriptorOrder = List.of();
      private List<String> poolIds = List.of();
      private List<String> usedPokemonIds = List.of();
      private int roundNumber;
      private String targetPokemonId;
      private String descriptorId;
      private List<PokeTabooHint> hints = List.of();
      private Long hintCooldownUntil;
      private List<PokeTabooAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, PokeTabooPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokeTabooRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokeTabooConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder descriptorOrder(List<String> value) { descriptorOrder = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder targetPokemonId(@Nullable String value) { targetPokemonId = value; return this; }

      public Builder descriptorId(@Nullable String value) { descriptorId = value; return this; }

      public Builder hints(List<PokeTabooHint> value) { hints = value; return this; }

      public Builder hintCooldownUntil(@Nullable Long value) { hintCooldownUntil = value; return this; }

      public Builder attempts(List<PokeTabooAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, PokeTabooPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokeTabooRoundResult value) { lastRound = value; return this; }

      public PokeTabooState build() {
        return new PokeTabooState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, descriptorOrder, poolIds, usedPokemonIds, roundNumber, targetPokemonId, descriptorId, hints,
            hintCooldownUntil, attempts, attemptCounts, cooldownUntil, scores, playerStats, roundStartedAt,
            roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /**
   * {@code pokeTabooActionSchema}: unión discriminada por {@code type}, cada variante estricta. Las longitudes son en
   * unidades UTF-16 ({@code string.length}). {@code SEND_HINT} recorta el texto con el {@code trim} de JS
   * ({@link JsStrings#trim}) antes de comprobar {@code min(1)}/{@code max(180)}, y la acción lleva el texto recortado.
   */
  public sealed interface PokeTabooAction {

    record GuessPokemon(String pokemonId) implements PokeTabooAction {}

    record SendHint(String text) implements PokeTabooAction {}

    static PokeTabooAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "GUESS_POKEMON" -> {
          strict(raw, Set.of("type", "pokemonId"));
          var pokemonId = string(raw, "pokemonId");
          if (pokemonId.isEmpty() || pokemonId.length() > 96) throw invalid();
          yield new GuessPokemon(pokemonId);
        }
        case "SEND_HINT" -> {
          strict(raw, Set.of("type", "text"));
          var text = JsStrings.trim(string(raw, "text"));
          if (text.isEmpty() || text.length() > 180) throw invalid();
          yield new SendHint(text);
        }
        default -> throw invalid();
      };
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

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de PokéTaboo no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeTabooPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      int lapNumber,
      int totalLaps,
      @Nullable String descriptorId,
      @Nullable String nextDescriptorId,
      List<String> descriptorOrder,
      List<PokeTabooHint> hints,
      List<PokeTabooAttempt> attempts,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokeTabooRoundResult lastRound,
      @Nullable GameResults results) {}

  /**
   * {@code PokeTabooPlayerState}: unión discriminada por {@code role}. Cada variante es un record con {@code role}
   * primero y solo sus campos.
   */
  public sealed interface PokeTabooPlayerState {

    String role();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Descriptor(String role, boolean canSendHint, @Nullable PokeTabooSecretPokemon secretPokemon,
        @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<PokeTabooAttempt> attempts)
        implements PokeTabooPlayerState {
      Descriptor(boolean canSendHint, @Nullable PokeTabooSecretPokemon secretPokemon,
          @Nullable List<PokeTabooAttempt> attempts) {
        this("DESCRIPTOR", canSendHint, secretPokemon, attempts);
      }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Guesser(String role, boolean canGuess, @Nullable Long cooldownUntil, int attemptCount,
        @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<PokeTabooAttempt> attempts)
        implements PokeTabooPlayerState {
      Guesser(boolean canGuess, @Nullable Long cooldownUntil, int attemptCount,
          @Nullable List<PokeTabooAttempt> attempts) {
        this("GUESSER", canGuess, cooldownUntil, attemptCount, attempts);
      }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Spectator(String role) implements PokeTabooPlayerState {
      static final Spectator INSTANCE = new Spectator("SPECTATOR");
    }
  }
}
