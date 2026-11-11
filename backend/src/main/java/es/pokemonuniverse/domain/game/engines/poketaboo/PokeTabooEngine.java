package es.pokemonuniverse.domain.game.engines.poketaboo;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessingRound;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooAction;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooAttempt;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooGuessedPokemon;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooHint;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooPlayerState;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooPlayerStats;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooPokemonReveal;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooPublicState;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooRoundResult;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooSecretPokemon;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** Traducción literal de {@code poke-taboo/server.ts}. */
public final class PokeTabooEngine
    implements GameEngine<PokeTabooConfig, PokeTabooState, PokeTabooAction, PokeTabooPublicState> {

  public static final String ID = "poke-taboo";
  public static final long GUESS_COOLDOWN_MS = 1_000;
  public static final long HINT_COOLDOWN_MS = 500;
  public static final long REVEAL_MS = 4_000;
  public static final int MAX_HINTS = 24;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokeTabooEngine(GameManifest manifest) {
    if (!ID.equals(Objects.requireNonNull(manifest, "manifest").id())) {
      throw new IllegalArgumentException("Manifiesto de " + manifest.id() + " para el motor " + ID);
    }
    this.manifest = manifest;
  }

  @Override
  public GameManifest manifest() {
    return manifest;
  }

  @Override
  public PokeTabooConfig parseConfig(JsonNode raw) {
    return PokeTabooConfig.parse(raw);
  }

  @Override
  public PokeTabooAction parseAction(JsonNode raw) {
    return PokeTabooAction.parse(raw);
  }

  @Override
  public PokeTabooConfig defaultConfig() {
    return PokeTabooConfig.defaults();
  }

  private static boolean truthy(@Nullable String value) {
    return value != null && !value.isEmpty();
  }

  /** {@code context.pokemon.byId(id ?? '')}. */
  private static @Nullable Pokemon byId(GameContext context, @Nullable String id) {
    return context.pokemon().byId(id == null ? "" : id).orElse(null);
  }

  public static List<Pokemon> pokeTabooPool(PokeTabooConfig config, GameContext context) {
    return context.pokemon().forGenerations(config.generations(), config.includeRegionalForms()).stream()
        .filter(pokemon -> truthy(pokemon.id()) && truthy(pokemon.name()) && truthy(pokemon.sprite()))
        .toList();
  }

  private static PokeTabooState incrementDescriptorFailure(PokeTabooState state, String descriptorId) {
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(descriptorId, PokeTabooRules.statsOf(state, descriptorId).afterDescriptorRound(false, 0));
    return state.toBuilder().playerStats(playerStats).build();
  }

  private static PokeTabooState finish(PokeTabooState state) {
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .targetPokemonId(null)
        .descriptorId(null)
        .hints(List.of())
        .attempts(List.of())
        .roundStartedAt(null)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .build();
  }

  /** Consume {@code random} una vez; sin Pokémon por usar, vuelve a elegir entre todo el pool. */
  private static Pokemon selectTarget(PokeTabooState state, GameContext context) {
    var pool = state.poolIds().stream().map(id -> context.pokemon().byId(id)).flatMap(Optional::stream).toList();
    var candidates = pool.stream().filter(pokemon -> !state.usedPokemonIds().contains(pokemon.id())).toList();
    if (candidates.isEmpty()) candidates = pool;
    double random = context.random().getAsDouble();
    if (candidates.isEmpty()) throw new EngineException("No hay Pokémon disponibles para PokéTaboo.");
    return candidates.get(Math.min((int) Math.floor(random * candidates.size()), candidates.size() - 1));
  }

  /** Salta (y anota como fallida) la ronda de cada descriptor que no está conectado. */
  private static PokeTabooState beginNextRound(PokeTabooState initial, GameContext context) {
    var state = initial;
    int totalRounds = state.playerIds().size() * state.config().laps();
    while (state.roundNumber() < totalRounds) {
      int roundNumber = state.roundNumber() + 1;
      var descriptorId = state.descriptorOrder().get((roundNumber - 1) % state.descriptorOrder().size());
      if (!context.isPlayerRequired(descriptorId)) {
        state = incrementDescriptorFailure(state.toBuilder().roundNumber(roundNumber).build(), descriptorId);
        continue;
      }
      var target = selectTarget(state, context);
      if (context.preloadImage() != null) context.preloadImage().accept(target.sprite());
      var usedPokemonIds = new LinkedHashSet<>(state.usedPokemonIds());
      usedPokemonIds.add(target.id());
      return state.toBuilder()
          .phase(GamePhase.ROUND_ACTIVE)
          .roundNumber(roundNumber)
          .descriptorId(descriptorId)
          .targetPokemonId(target.id())
          .usedPokemonIds(new ArrayList<>(usedPokemonIds))
          .hints(List.of())
          .hintCooldownUntil(null)
          .attempts(List.of())
          .attemptCounts(Map.of())
          .cooldownUntil(Map.of())
          .roundStartedAt(context.now())
          .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
          .nextTransitionAt(null)
          .lastRound(null)
          .build();
    }
    return finish(state);
  }

  private static PokeTabooState resolveRound(PokeTabooState state, GameContext context, @Nullable String winnerId) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var target = byId(context, state.targetPokemonId());
    var descriptorId = state.descriptorId();
    if (target == null || descriptorId == null) {
      throw new EngineException("El secreto de PokéTaboo ya no está disponible.");
    }
    var scores = new LinkedHashMap<>(state.scores());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    int guesserPoints = 0;
    int descriptorPoints = 0;
    if (winnerId != null) {
      guesserPoints = PokeTabooRules.pokeTabooGuesserPoints(Objects.requireNonNull(state.roundStartedAt()),
          state.config().roundSeconds(), context.now());
      descriptorPoints = PokeTabooRules.DESCRIPTOR_POINTS;
      scores.put(winnerId, scores.getOrDefault(winnerId, 0) + guesserPoints);
      scores.put(descriptorId, scores.getOrDefault(descriptorId, 0) + descriptorPoints);
      var winnerStats = Objects.requireNonNullElse(playerStats.get(winnerId), PokeTabooPlayerStats.ZERO);
      int attemptCount = state.attemptCounts().getOrDefault(winnerId, 0);
      playerStats.put(winnerId, winnerStats.afterGuessed(attemptCount == 1, guesserPoints));
    }
    var descriptorStats = Objects.requireNonNullElse(playerStats.get(descriptorId), PokeTabooPlayerStats.ZERO);
    playerStats.put(descriptorId, descriptorStats.afterDescriptorRound(winnerId != null, descriptorPoints));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(new PokeTabooRoundResult(winnerId != null ? "GUESSED" : "TIMEOUT", PokeTabooPokemonReveal.of(target),
            descriptorId, winnerId, guesserPoints, descriptorPoints,
            winnerId != null ? state.attemptCounts().getOrDefault(winnerId, 0) : null))
        .build();
  }

  /** Consume {@code random} al barajar el orden de descriptores (una extracción por jugador menos uno). */
  @Override
  public PokeTabooState createInitialState(PokeTabooConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var pool = pokeTabooPool(config, context);
    if (pool.isEmpty()) throw new EngineException("No hay Pokémon disponibles para esa configuración.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, PokeTabooPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, PokeTabooPlayerStats.ZERO);
    }
    return PokeTabooState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .descriptorOrder(Randoms.shuffled(playerIds, context.random()))
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public PokeTabooState start(PokeTabooState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginNextRound(state, context);
  }

  @Override
  public GameActionResult<PokeTabooState> handleAction(PokeTabooState state, String playerId, PokeTabooAction action,
      GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
    }
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(resolveRound(state, context, null), "El tiempo ha terminado.");
    }
    if (action instanceof PokeTabooAction.SendHint sendHint) {
      if (!playerId.equals(state.descriptorId())) {
        return GameActionResult.reject(state, "Solo el descriptor puede escribir pistas.");
      }
      if (state.hints().size() >= MAX_HINTS) {
        return GameActionResult.reject(state, "Ya has enviado el máximo de pistas de esta ronda.");
      }
      if (Timing.cooldownRemainingMs(context.now(), state.hintCooldownUntil()) > 0) {
        return GameActionResult.reject(state, "Espera un momento antes de enviar otra pista.");
      }
      var target = byId(context, state.targetPokemonId());
      if (target == null) return GameActionResult.reject(state, "El Pokémon secreto no está disponible.");
      if (PokeTabooRules.containsTabooPokemonName(sendHint.text(), target)) {
        return GameActionResult.reject(state, "No puedes escribir el nombre del Pokémon.");
      }
      var hints = new ArrayList<>(state.hints());
      hints.add(new PokeTabooHint(state.hints().size() + 1, JsStrings.trim(sendHint.text()), context.now()));
      return GameActionResult.accept(state.toBuilder()
          .hints(hints)
          .hintCooldownUntil(context.now() + HINT_COOLDOWN_MS)
          .build());
    }
    var guess = (PokeTabooAction.GuessPokemon) action;
    if (playerId.equals(state.descriptorId())) return GameActionResult.reject(state, "El descriptor no puede adivinar.");
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var guessed = context.pokemon().byId(guess.pokemonId()).orElse(null);
    if (guessed == null || !state.poolIds().contains(guessed.id())) {
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
    }
    int attemptCount = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attemptCount);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, PokeTabooRules.statsOf(state, playerId).afterAttempt());
    var next = state.toBuilder().attemptCounts(attemptCounts).playerStats(playerStats).build();
    if (guessed.id().equals(state.targetPokemonId())) {
      return GameActionResult.accept(resolveRound(next, context, playerId));
    }
    var attempts = new ArrayList<>(next.attempts());
    attempts.add(new PokeTabooAttempt(playerId,
        new PokeTabooGuessedPokemon(guessed.id(), guessed.name(), guessed.sprite()), context.now()));
    return GameActionResult.accept(next.toBuilder()
        .attempts(attempts)
        .cooldownUntil(Timing.setPlayerCooldown(next.cooldownUntil(), playerId, context.now(), GUESS_COOLDOWN_MS))
        .build());
  }

  @Override
  public PokeTabooState handleTimeout(PokeTabooState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return resolveRound(state, context, null);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginNextRound(state, context);
    }
    return state;
  }

  @Override
  public PokeTabooState handlePresenceChange(PokeTabooState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.descriptorId() == null
        || context.isPlayerRequired(state.descriptorId())) {
      return state;
    }
    var canceled = incrementDescriptorFailure(state, state.descriptorId());
    return beginNextRound(canceled.toBuilder()
        .targetPokemonId(null)
        .descriptorId(null)
        .hints(List.of())
        .attempts(List.of())
        .roundStartedAt(null)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .lastRound(null)
        .build(), context);
  }

  @Override
  public PokeTabooPublicState getPublicState(PokeTabooState state, GameContext context) {
    int totalRounds = state.playerIds().size() * state.config().laps();
    var nextDescriptorId = state.roundNumber() < totalRounds
        ? state.descriptorOrder().get(state.roundNumber() % state.descriptorOrder().size())
        : null;
    int lapNumber = Math.min(state.config().laps(),
        Math.max(0, state.roundNumber() - 1) / state.playerIds().size() + 1);
    return new PokeTabooPublicState(ID, state.phase(), state.roundNumber(), totalRounds, lapNumber,
        state.config().laps(), state.descriptorId(), nextDescriptorId, state.descriptorOrder(), state.hints(),
        GuessingRound.publicAttempts(state.config().publicAttempts(), state.attempts()),
        state.scores(), state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        state.phase() == GamePhase.ROUND_RESULTS ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? PokeTabooRules.buildPokeTabooResults(state) : null);
  }

  @Override
  public PokeTabooPlayerState getPlayerState(PokeTabooState state, String playerId, GameContext context) {
    boolean participating = state.playerIds().contains(playerId) && context.isPlayerRequired(playerId);
    if (!participating) return PokeTabooPlayerState.Spectator.INSTANCE;
    if (state.phase() == GamePhase.ROUND_ACTIVE && playerId.equals(state.descriptorId())) {
      var target = byId(context, state.targetPokemonId());
      return new PokeTabooPlayerState.Descriptor(target != null,
          target != null ? PokeTabooSecretPokemon.of(target) : null,
          GuessingRound.guideAttempts(state.config().publicAttempts(), state.attempts()));
    }
    return new PokeTabooPlayerState.Guesser(
        state.phase() == GamePhase.ROUND_ACTIVE && !playerId.equals(state.descriptorId()),
        state.cooldownUntil().get(playerId),
        state.attemptCounts().getOrDefault(playerId, 0),
        GuessingRound.ownAttempts(state.config().publicAttempts(), state.attempts(),
            PokeTabooAttempt::playerId, playerId));
  }

  @Override
  public GameLifecycle getLifecycle(PokeTabooState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokeTabooState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokeTabooState state) {
    return PokeTabooRules.buildPokeTabooResults(state);
  }
}
