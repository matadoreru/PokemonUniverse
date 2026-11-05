package es.pokemonuniverse.domain.game.engines.typechain;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.Immutables;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainAction;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainElimination;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainEliminationReason;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainEvent;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainFinishReason;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainInvalidAttempt;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainInvalidReason;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainLastAttempt;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainNode;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainPlayerState;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainPlayerStats;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainPokemonView;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainPublicState;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.DoubleSupplier;

/** Traducción literal de {@code type-chain/server.ts}. */
public final class TypeChainEngine
    implements GameEngine<TypeChainConfig, TypeChainState, TypeChainAction, TypeChainPublicState> {

  public static final String ID = "type-chain";
  public static final long INVALID_COOLDOWN_MS = 1_000;
  public static final int MAX_TURNS = 500;
  public static final int MAX_RECENT_ATTEMPTS = 40;
  public static final int MAX_RECENT_EVENTS = 30;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public TypeChainEngine(GameManifest manifest) {
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
  public TypeChainConfig parseConfig(JsonNode raw) {
    return TypeChainConfig.parse(raw);
  }

  @Override
  public TypeChainAction parseAction(JsonNode raw) {
    return TypeChainAction.parse(raw);
  }

  @Override
  public TypeChainConfig defaultConfig() {
    return TypeChainConfig.defaults();
  }

  private static TypeChainPokemonView pokemonView(Pokemon pokemon) {
    return new TypeChainPokemonView(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.types());
  }

  private static List<Pokemon> pool(TypeChainState state, GameContext context) {
    return state.poolIds().stream().map(id -> context.pokemon().byId(id)).flatMap(Optional::stream).toList();
  }

  /** {@code [...events, event].slice(-TYPE_CHAIN_MAX_RECENT_EVENTS)}. */
  private static List<TypeChainEvent> appendEvent(List<TypeChainEvent> events, TypeChainEvent event) {
    var result = new ArrayList<>(events);
    result.add(event);
    return lastItems(result, MAX_RECENT_EVENTS);
  }

  private static <T> List<T> lastItems(List<T> items, int count) {
    return items.size() <= count ? items : new ArrayList<>(items.subList(items.size() - count, items.size()));
  }

  /**
   * Tipo de una cadena nueva, al azar (una extracción si hay opciones) entre los que tienen Pokémon suficientes en el
   * pool: primero los que aún no han tenido cadena en la partida; si ya salieron todos, cualquiera menos el actual.
   */
  public static @Nullable String selectTypeChainType(List<Pokemon> allowed, List<String> usedChainTypes,
      @Nullable String currentType, DoubleSupplier random) {
    var eligible = TypeChainRules.typeChainEligibleTypes(allowed);
    var fresh = eligible.stream().filter(type -> !usedChainTypes.contains(type)).toList();
    var other = eligible.stream().filter(type -> !type.equals(currentType)).toList();
    var options = !fresh.isEmpty() ? fresh : !other.isEmpty() ? other : eligible;
    if (options.isEmpty()) return null;
    return Randoms.randomItem(options, random);
  }

  private static @Nullable String nextActivePlayer(TypeChainState state, String afterPlayerId) {
    var turnOrder = state.turnOrder();
    int start = turnOrder.indexOf(afterPlayerId);
    for (int offset = 1; offset <= turnOrder.size(); offset += 1) {
      var candidate = turnOrder.get((start + offset + turnOrder.size()) % turnOrder.size());
      if (state.activePlayerIds().contains(candidate)) return candidate;
    }
    return null;
  }

  private static TypeChainState finish(TypeChainState state, TypeChainFinishReason reason) {
    int longestChain = Math.max(state.longestChain(), state.chain().size());
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .longestChain(longestChain)
        .currentPlayerId(null)
        .turnStartedAt(null)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .finishReason(reason)
        .winnerId(TypeChainRules.typeChainWinner(state))
        .build();
  }

  /** Cadena nueva, vacía y con otro tipo; los usados vuelven a valer. Consume {@code random} una vez (el tipo). */
  private static TypeChainState newChain(TypeChainState state, GameContext context) {
    var chainType = selectTypeChainType(pool(state, context), state.usedChainTypes(), state.chainType(),
        context.random());
    if (chainType == null) {
      throw new EngineException("No hay Pokémon suficientes para crear una cadena con esta configuración.");
    }
    int previousLength = state.chain().size();
    var usedChainTypes = new ArrayList<>(state.usedChainTypes());
    usedChainTypes.add(chainType);
    return state.toBuilder()
        .chainNumber(state.chainNumber() + 1)
        .chainType(chainType)
        .usedChainTypes(usedChainTypes)
        .chain(List.of())
        .usedPokemonIds(List.of())
        .longestChain(Math.max(state.longestChain(), previousLength))
        .events(state.chainType() != null
            ? appendEvent(state.events(),
                new TypeChainEvent.ChainReset(previousLength, state.chainType(), chainType, context.now()))
            : state.events())
        .build();
  }

  private static TypeChainState eliminateOnly(TypeChainState state, String playerId,
      TypeChainEliminationReason reason, GameContext context) {
    if (!state.activePlayerIds().contains(playerId)) return state;
    var stats = TypeChainRules.statsOf(state, playerId);
    var elimination = new TypeChainElimination(playerId, reason, state.turnNumber(), context.now(),
        state.eliminations().size() + 1);
    var spectatorIds = new LinkedHashSet<>(state.spectatorIds());
    spectatorIds.add(playerId);
    var eliminations = new ArrayList<>(state.eliminations());
    eliminations.add(elimination);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats.afterElimination(reason));
    return state.toBuilder()
        .activePlayerIds(state.activePlayerIds().stream().filter(id -> !id.equals(playerId)).toList())
        .spectatorIds(new ArrayList<>(spectatorIds))
        .eliminations(eliminations)
        .events(appendEvent(state.events(), new TypeChainEvent.Elimination(playerId, reason, context.now())))
        .playerStats(playerStats)
        .build();
  }

  private static TypeChainState activateTurn(TypeChainState state, @Nullable String requestedPlayerId,
      GameContext context) {
    var next = state;
    var playerId = requestedPlayerId;
    while (playerId != null && !context.isPlayerRequired(playerId)) {
      var removed = playerId;
      next = eliminateOnly(next, removed, TypeChainEliminationReason.DISCONNECTED, context);
      if (next.activePlayerIds().size() <= 1) return finish(next, TypeChainFinishReason.SURVIVOR);
      playerId = nextActivePlayer(next, removed);
    }
    if (playerId == null || next.activePlayerIds().size() <= 1) return finish(next, TypeChainFinishReason.SURVIVOR);
    if (next.chainType() == null) throw new EngineException("La cadena no tiene tipo.");
    // Si ya no queda ningún Pokémon sin usar de ese tipo, nadie queda eliminado: empieza otra cadena con otro tipo.
    var remaining = TypeChainRules.getValidTypeChainCandidates(next.chainType(), pool(next, context),
        new HashSet<>(next.usedPokemonIds()));
    if (remaining.isEmpty()) next = newChain(next, context);
    var lastAttempt = new LinkedHashMap<>(next.lastAttempt());
    lastAttempt.remove(playerId);
    var cooldownUntil = new LinkedHashMap<>(next.cooldownUntil());
    cooldownUntil.put(playerId, 0L);
    return next.toBuilder()
        .phase(GamePhase.TURN_ACTIVE)
        .currentPlayerId(playerId)
        .turnNumber(next.turnNumber() + 1)
        .turnStartedAt(context.now())
        .roundEndsAt(context.now() + next.config().turnSeconds() * 1_000L)
        .nextTransitionAt(null)
        .cooldownUntil(cooldownUntil)
        .lastAttempt(lastAttempt)
        .build();
  }

  private static TypeChainState invalidAttempt(TypeChainState state, String playerId, Pokemon pokemon,
      TypeChainInvalidReason reason, GameContext context) {
    var stats = TypeChainRules.statsOf(state, playerId);
    var invalidAttempts = new ArrayList<>(state.invalidAttempts());
    invalidAttempts.add(new TypeChainInvalidAttempt(playerId, pokemonView(pokemon), reason, context.now()));
    var lastAttempt = new LinkedHashMap<>(state.lastAttempt());
    lastAttempt.put(playerId, new TypeChainLastAttempt(reason, pokemon.name(), context.now()));
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats.afterInvalidAttempt());
    return state.toBuilder()
        .invalidAttempts(lastItems(invalidAttempts, MAX_RECENT_ATTEMPTS))
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(), INVALID_COOLDOWN_MS))
        .lastAttempt(lastAttempt)
        .playerStats(playerStats)
        .build();
  }

  /** Consume {@code random} solo al barajar el orden de turnos (una extracción por jugador menos uno). */
  @Override
  public TypeChainState createInitialState(TypeChainConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var allowed = context.pokemon().forGenerations(config.generations(), true).stream()
        .filter(pokemon -> !pokemon.types().isEmpty())
        .toList();
    if (TypeChainRules.typeChainEligibleTypes(allowed).isEmpty()) {
      throw new EngineException("No hay suficientes Pokémon para crear una cadena con esta configuración.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var turnOrder = Randoms.shuffled(playerIds, context.random());
    var playerStats = new LinkedHashMap<String, TypeChainPlayerStats>();
    for (var id : playerIds) playerStats.put(id, TypeChainPlayerStats.ZERO);
    return TypeChainState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .turnOrder(turnOrder)
        .activePlayerIds(turnOrder)
        .poolIds(allowed.stream().map(Pokemon::id).toList())
        .playerStats(playerStats)
        .build();
  }

  @Override
  public TypeChainState start(TypeChainState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    var withType = newChain(state, context);
    return activateTurn(withType, withType.turnOrder().getFirst(), context);
  }

  @Override
  public GameActionResult<TypeChainState> handleAction(TypeChainState state, String playerId, TypeChainAction action,
      GameContext context) {
    if (state.phase() != GamePhase.TURN_ACTIVE) return GameActionResult.reject(state, "No hay un turno activo.");
    if (!playerId.equals(state.currentPlayerId())) return GameActionResult.reject(state, "No es tu turno.");
    if (!state.activePlayerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Ya no participas en esta cadena.");
    }
    if (context.now() >= (state.roundEndsAt() == null ? 0 : state.roundEndsAt())) {
      return GameActionResult.reject(state, "El turno ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var candidate = context.pokemon().byId(action.pokemonId()).orElse(null);
    if (candidate == null) return GameActionResult.reject(state, "Pokémon desconocido.");
    if (!state.poolIds().contains(candidate.id())) {
      return GameActionResult.accept(
          invalidAttempt(state, playerId, candidate, TypeChainInvalidReason.OUT_OF_POOL, context));
    }
    if (state.usedPokemonIds().contains(candidate.id())) {
      return GameActionResult.accept(
          invalidAttempt(state, playerId, candidate, TypeChainInvalidReason.ALREADY_USED, context));
    }
    var chainType = state.chainType();
    if (chainType == null) return GameActionResult.reject(state, "La cadena no tiene tipo.");
    if (!TypeChainRules.hasTypeChainType(candidate, chainType)) {
      return GameActionResult.accept(
          invalidAttempt(state, playerId, candidate, TypeChainInvalidReason.WRONG_TYPE, context));
    }
    var stats = TypeChainRules.statsOf(state, playerId);
    var named = pokemonView(candidate);
    int completedTurns = state.completedTurns() + 1;
    var chain = new ArrayList<>(state.chain());
    chain.add(new TypeChainNode(named, playerId, state.turnNumber()));
    var usedPokemonIds = new ArrayList<>(state.usedPokemonIds());
    usedPokemonIds.add(candidate.id());
    var cooldownUntil = new LinkedHashMap<>(state.cooldownUntil());
    cooldownUntil.put(playerId, 0L);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats.afterValidSubmission());
    var successful = state.toBuilder()
        .chain(chain)
        .usedPokemonIds(usedPokemonIds)
        .longestChain(Math.max(state.longestChain(), state.chain().size() + 1))
        .completedTurns(completedTurns)
        .cooldownUntil(cooldownUntil)
        .events(appendEvent(state.events(),
            new TypeChainEvent.Success(playerId, named, chainType, context.now())))
        .playerStats(playerStats)
        .build();
    if (completedTurns >= MAX_TURNS) return GameActionResult.accept(finish(successful, TypeChainFinishReason.MAX_TURNS));
    var nextId = nextActivePlayer(successful, playerId);
    return GameActionResult.accept(activateTurn(successful, nextId, context));
  }

  @Override
  public TypeChainState handleTimeout(TypeChainState state, GameContext context) {
    if (state.phase() != GamePhase.TURN_ACTIVE || state.roundEndsAt() == null || context.now() < state.roundEndsAt()
        || state.currentPlayerId() == null) {
      return state;
    }
    var eliminatedId = state.currentPlayerId();
    var eliminated = eliminateOnly(state, eliminatedId, TypeChainEliminationReason.TIMEOUT, context);
    if (eliminated.activePlayerIds().size() <= 1) return finish(eliminated, TypeChainFinishReason.SURVIVOR);
    return activateTurn(eliminated, nextActivePlayer(eliminated, eliminatedId), context);
  }

  @Override
  public TypeChainState handlePresenceChange(TypeChainState state, GameContext context) {
    if (state.phase() != GamePhase.TURN_ACTIVE || state.currentPlayerId() == null
        || context.isPlayerRequired(state.currentPlayerId())) {
      return state;
    }
    var eliminatedId = state.currentPlayerId();
    var eliminated = eliminateOnly(state, eliminatedId, TypeChainEliminationReason.DISCONNECTED, context);
    if (eliminated.activePlayerIds().size() <= 1) return finish(eliminated, TypeChainFinishReason.SURVIVOR);
    return activateTurn(eliminated, nextActivePlayer(eliminated, eliminatedId), context);
  }

  @Override
  public TypeChainPublicState getPublicState(TypeChainState state, GameContext context) {
    return new TypeChainPublicState(ID, state.phase(), state.turnOrder(), state.activePlayerIds(),
        state.eliminations().stream().map(TypeChainElimination::playerId).toList(),
        state.currentPlayerId(),
        state.currentPlayerId() != null ? nextActivePlayer(state, state.currentPlayerId()) : null,
        state.turnNumber(), state.chainNumber(), state.chainType(), state.chain(), state.usedPokemonIds(),
        Math.max(state.longestChain(), state.chain().size()), namedCounts(state), state.turnStartedAt(),
        state.roundEndsAt(),
        state.invalidAttempts(), state.eliminations(), state.events(),
        state.phase() == GamePhase.GAME_RESULTS ? TypeChainRules.buildTypeChainResults(state) : null);
  }

  /** {@code Object.fromEntries(playerIds.map(id => [id, playerStats[id]?.validSubmissions ?? 0]))}, en ese orden. */
  private static Map<String, Integer> namedCounts(TypeChainState state) {
    var counts = new LinkedHashMap<String, Integer>();
    for (var id : state.playerIds()) counts.put(id, TypeChainRules.statsOf(state, id).validSubmissions());
    return Immutables.frozenMap(counts);
  }

  @Override
  public TypeChainPlayerState getPlayerState(TypeChainState state, String playerId, GameContext context) {
    boolean eliminated = state.spectatorIds().contains(playerId);
    return new TypeChainPlayerState(
        state.phase() == GamePhase.TURN_ACTIVE && playerId.equals(state.currentPlayerId()) && !eliminated
            && context.isPlayerRequired(playerId),
        playerId.equals(state.currentPlayerId()),
        eliminated,
        state.cooldownUntil().get(playerId),
        state.lastAttempt().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(TypeChainState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .turnNumber(state.turnNumber())
        .spectatorIds(state.spectatorIds())
        .build();
  }

  @Override
  public boolean isFinished(TypeChainState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(TypeChainState state) {
    return TypeChainRules.buildTypeChainResults(state);
  }
}
