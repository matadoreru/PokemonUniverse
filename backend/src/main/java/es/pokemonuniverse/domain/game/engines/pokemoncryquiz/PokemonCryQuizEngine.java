package es.pokemonuniverse.domain.game.engines.pokemoncryquiz;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog;
import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog.CryVersion;
import es.pokemonuniverse.domain.game.engine.infra.AssetTokens;
import es.pokemonuniverse.domain.game.engine.infra.GuessingRound;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizConfig.CryVersionMode;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizAction;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizAttempt;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizAttemptOutcome;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizLastAttempt;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizPokemonSummary;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizPublicPokemon;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizPublicState;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizRole;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizRoundPokemon;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizRoundPublicResult;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizRoundResult;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizSolve;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizSolvedPlayer;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** Traducción literal de {@code pokemon-cry-quiz/server.ts}. */
public final class PokemonCryQuizEngine implements
    GameEngine<PokemonCryQuizConfig, PokemonCryQuizState, PokemonCryQuizAction, PokemonCryQuizPublicState> {

  public static final String ID = "pokemon-cry-quiz";
  public static final long COOLDOWN_MS = 1_000;
  public static final long REVEAL_MS = 4_000;

  private final GameManifest manifest;

  private static final TimedRoundStrategy<PokemonCryQuizState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public PokemonCryQuizState beginNext(PokemonCryQuizState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public PokemonCryQuizState resolveActive(PokemonCryQuizState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public PokemonCryQuizState finish(PokemonCryQuizState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(PokemonCryQuizState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonCryQuizEngine(GameManifest manifest) {
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
  public PokemonCryQuizConfig parseConfig(JsonNode raw) {
    return PokemonCryQuizConfig.parse(raw);
  }

  @Override
  public PokemonCryQuizAction parseAction(JsonNode raw) {
    return PokemonCryQuizAction.parse(raw);
  }

  @Override
  public PokemonCryQuizConfig defaultConfig() {
    return PokemonCryQuizConfig.defaults();
  }

  /** {@code cryPath}: ruta opaca del grito de la ronda; {@code roomCode ?? 'opaque'}. */
  private static String cryPath(PokemonCryQuizState state, GameContext context) {
    return AssetTokens.roundAssetPath(Objects.requireNonNullElse(context.roomCode(), "opaque"), state.assetToken(),
        state.roundNumber(), "cry", "audio");
  }

  private static boolean blank(@Nullable String value) {
    return value == null || value.isEmpty();
  }

  /** {@code Boolean(cryFor(...))}: una URL vacía cuenta como ausente. */
  private static boolean hasCry(PokemonAudioCatalog audio, String pokemonId, CryVersion version) {
    return !blank(audio.cryFor(pokemonId, version));
  }

  /** {@code pokemonCryPool}: vacío sin catálogo de audio. */
  static List<Pokemon> pool(PokemonCryQuizConfig config, GameContext context) {
    var audio = context.pokemonAudio();
    if (audio == null) return List.of();
    return context.pokemon().forGenerations(config.generations(), config.includeRegionalForms()).stream()
        .filter(pokemon -> {
          if (blank(pokemon.id()) || blank(pokemon.name()) || blank(pokemon.sprite())) return false;
          return switch (config.cryVersion()) {
            case LATEST -> hasCry(audio, pokemon.id(), CryVersion.LATEST);
            case LEGACY -> hasCry(audio, pokemon.id(), CryVersion.LEGACY);
            case RANDOM -> hasCry(audio, pokemon.id(), CryVersion.LATEST)
                || hasCry(audio, pokemon.id(), CryVersion.LEGACY);
          };
        })
        .toList();
  }

  /** {@code chooseVersion}: solo {@code RANDOM} consume {@code random()}, entre las versiones disponibles. */
  private static @Nullable CryVersion chooseVersion(PokemonCryQuizState state, String pokemonId, GameContext context) {
    if (state.config().cryVersion() != CryVersionMode.RANDOM) {
      return CryVersion.valueOf(state.config().cryVersion().name());
    }
    var audio = context.pokemonAudio();
    var available = new ArrayList<CryVersion>();
    for (var version : List.of(CryVersion.LATEST, CryVersion.LEGACY)) {
      if (audio != null && hasCry(audio, pokemonId, version)) available.add(version);
    }
    int index = Math.min((int) Math.floor(context.random().getAsDouble() * available.size()), available.size() - 1);
    // available[-1] de JS es undefined: el pool garantiza al menos una versión.
    return index >= 0 ? available.get(index) : null;
  }

  private static PokemonCryQuizState beginRound(PokemonCryQuizState state, GameContext context) {
    var pool = new ArrayList<Pokemon>();
    for (var id : state.poolIds()) context.pokemon().byId(id).ifPresent(pool::add);
    List<Pokemon> candidates = pool.stream()
        .filter(pokemon -> !state.usedPokemonIds().contains(pokemon.id()))
        .toList();
    if (candidates.isEmpty()) candidates = pool;
    if (candidates.isEmpty()) throw new EngineException("No hay gritos disponibles para esta configuración.");
    var target = Randoms.randomItem(candidates, context.random());
    var usedPokemonIds = new ArrayList<>(state.usedPokemonIds());
    if (!usedPokemonIds.contains(target.id())) usedPokemonIds.add(target.id());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .targetPokemonId(target.id())
        .currentCryVersion(chooseVersion(state, target.id(), context))
        .usedPokemonIds(usedPokemonIds)
        .attempts(List.of())
        .attemptCounts(Map.of())
        .solves(Map.of())
        .cooldownUntil(Map.of())
        .lastAttemptResult(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static PokemonCryQuizState resolveRound(PokemonCryQuizState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var found = context.pokemon().byId(Objects.requireNonNullElse(state.targetPokemonId(), ""));
    if (found.isEmpty() || state.currentCryVersion() == null) {
      throw new EngineException("El grito objetivo ya no está disponible.");
    }
    var target = found.get();
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : state.playerIds()) {
      if (!state.solves().containsKey(playerId)) {
        playerStats.put(playerId, playerStats.getOrDefault(playerId, PokemonCryQuizPlayerStats.ZERO).afterMiss());
      }
    }
    var lastRound = new PokemonCryQuizRoundResult(
        new PokemonCryQuizRoundPokemon(target.id(), target.name(), target.sprite(), target.generation()),
        state.currentCryVersion(), new LinkedHashMap<>(state.solves()), new LinkedHashMap<>(state.attemptCounts()));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static PokemonCryQuizState resolveIfComplete(PokemonCryQuizState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), PokemonCryQuizEngine::resolveRound);
  }

  /** Comprueba el catálogo de audio después de calcular el pool, en el orden de TS. */
  @Override
  public PokemonCryQuizState createInitialState(PokemonCryQuizConfig config, GameContext context) {
    var pool = pool(config, context);
    var audio = context.pokemonAudio();
    if (audio == null) throw new EngineException("El catálogo local de gritos no está disponible.");
    if (audio.pokemonIds(null).isEmpty()) {
      throw new EngineException("PostgreSQL no contiene gritos. Ejecuta una sincronización completa de PokéAPI desde "
          + "Administración y vuelve a intentarlo.");
    }
    if (pool.isEmpty()) {
      throw new EngineException("No hay gritos disponibles en PostgreSQL para las generaciones seleccionadas.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var assetToken = AssetTokens.randomToken(context);
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, PokemonCryQuizPlayerStats>();
    for (var id : playerIds) scores.put(id, 0);
    for (var id : playerIds) playerStats.put(id, PokemonCryQuizPlayerStats.ZERO);
    return PokemonCryQuizState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .assetToken(assetToken)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  /** Sin comprobación de fase, como el {@code start} de TS. */
  @Override
  public PokemonCryQuizState start(PokemonCryQuizState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<PokemonCryQuizState> handleAction(PokemonCryQuizState state, String playerId,
      PokemonCryQuizAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
    }
    if (state.solves().containsKey(playerId)) return GameActionResult.reject(state, "Ya has acertado esta ronda.");
    if (context.now() >= Objects.requireNonNullElse(state.roundEndsAt(), 0L)) {
      // Rechazo que también resuelve la ronda, como el { state: resolveRound(...), accepted: false } de TS.
      return GameActionResult.reject(resolveRound(state, context), "El tiempo ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var found = context.pokemon().byId(action.pokemonId());
    if (found.isEmpty() || !state.poolIds().contains(found.get().id())) {
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
    }
    var guessed = found.get();
    int attempts = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var stats = state.playerStats().getOrDefault(playerId, PokemonCryQuizPlayerStats.ZERO);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attempts);
    var lastAttemptResult = new LinkedHashMap<>(state.lastAttemptResult());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    if (guessed.id().equals(state.targetPokemonId())) {
      long roundStartedAt = Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
      int solveOrder = state.solves().size() + 1;
      long elapsedMs = context.now() - roundStartedAt;
      var score = PokemonCryQuizRules.pokemonCryScore(roundStartedAt, state.config().roundSeconds(), context.now(),
          solveOrder);
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId, PokemonCryQuizSolve.of(solveOrder, context.now(), elapsedMs, score, attempts));
      lastAttemptResult.put(playerId,
          new PokemonCryQuizLastAttempt(PokemonCryQuizAttemptOutcome.CORRECT, context.now()));
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + score.totalPoints());
      playerStats.put(playerId,
          GuessingRound.recordGuessSolve(stats, attempts, solveOrder, elapsedMs, score.totalPoints()));
      var next = state.toBuilder()
          .attemptCounts(attemptCounts)
          .solves(solves)
          .lastAttemptResult(lastAttemptResult)
          .scores(scores)
          .playerStats(playerStats)
          .build();
      return GameActionResult.accept(resolveIfComplete(next, context));
    }
    var recent = new ArrayList<>(state.attempts());
    recent.add(new PokemonCryQuizAttempt(playerId, PokemonCryQuizPokemonSummary.of(guessed), context.now()));
    lastAttemptResult.put(playerId,
        new PokemonCryQuizLastAttempt(PokemonCryQuizAttemptOutcome.INCORRECT, context.now()));
    playerStats.put(playerId, stats.afterWrongAttempt());
    return GameActionResult.accept(state.toBuilder()
        .attempts(recent)
        .attemptCounts(attemptCounts)
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(), COOLDOWN_MS))
        .lastAttemptResult(lastAttemptResult)
        .playerStats(playerStats)
        .build());
  }

  @Override
  public PokemonCryQuizState handleTimeout(PokemonCryQuizState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public PokemonCryQuizState handlePresenceChange(PokemonCryQuizState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public PokemonCryQuizPublicState getPublicState(PokemonCryQuizState state, GameContext context) {
    boolean revealActive = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    var solvedPlayers = state.solves().entrySet().stream()
        .map(entry -> new PokemonCryQuizSolvedPlayer(entry.getKey(), entry.getValue().solveOrder()))
        .sorted(Comparator.comparingInt(PokemonCryQuizSolvedPlayer::solveOrder))
        .toList();
    var lastRound = state.lastRound();
    var publicLastRound = lastRound != null && revealActive
        ? new PokemonCryQuizRoundPublicResult(
            new PokemonCryQuizPublicPokemon(lastRound.pokemon().name(), lastRound.pokemon().sprite(),
                lastRound.pokemon().generation()),
            lastRound.cryVersion(), cryPath(state, context), lastRound.solves(), lastRound.attemptCounts())
        : null;
    return new PokemonCryQuizPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        state.phase() == GamePhase.ROUND_ACTIVE ? cryPath(state, context) : null,
        GuessingRound.publicAttempts(state.config().publicAttempts(), state.attempts()), solvedPlayers,
        state.scores(), state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(), publicLastRound,
        state.phase() == GamePhase.GAME_RESULTS ? PokemonCryQuizRules.buildPokemonCryResults(state) : null);
  }

  @Override
  public PokemonCryQuizPlayerState getPlayerState(PokemonCryQuizState state, String playerId, GameContext context) {
    var solve = state.solves().get(playerId);
    boolean participating = state.playerIds().contains(playerId) && context.isPlayerRequired(playerId);
    return new PokemonCryQuizPlayerState(
        state.playerIds().contains(playerId) ? PokemonCryQuizRole.PLAYER : PokemonCryQuizRole.SPECTATOR,
        state.phase() == GamePhase.ROUND_ACTIVE && participating && solve == null,
        solve != null,
        solve == null ? null : solve.solveOrder(),
        state.cooldownUntil().get(playerId),
        solve == null ? 0 : solve.points(),
        state.attemptCounts().getOrDefault(playerId, 0),
        state.lastAttemptResult().get(playerId),
        GuessingRound.ownAttempts(state.config().publicAttempts(), state.attempts(),
            PokemonCryQuizAttempt::playerId, playerId));
  }

  /**
   * Solo {@code cry} de la ronda pedida, en cualquier fase: la URL del grito (un {@code string} en TS, es decir
   * {@code ORIGINAL}). Nunca llega a la proyección.
   */
  @Override
  public Optional<AssetResolution> resolveAsset(PokemonCryQuizState state, AssetRequest request,
      GameContext context) {
    if (!state.assetToken().equals(request.assetToken()) || state.roundNumber() != request.roundNumber()
        || !"cry".equals(request.assetId()) || blank(state.targetPokemonId()) || state.currentCryVersion() == null) {
      return Optional.empty();
    }
    var audio = context.pokemonAudio();
    var cry = audio == null ? null : audio.cryFor(state.targetPokemonId(), state.currentCryVersion());
    return cry == null ? Optional.empty() : Optional.of(AssetResolution.original(cry));
  }

  @Override
  public GameLifecycle getLifecycle(PokemonCryQuizState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokemonCryQuizState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonCryQuizState state) {
    return PokemonCryQuizRules.buildPokemonCryResults(state);
  }
}
