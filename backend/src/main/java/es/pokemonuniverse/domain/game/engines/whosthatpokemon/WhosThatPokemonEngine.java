package es.pokemonuniverse.domain.game.engines.whosthatpokemon;

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
import es.pokemonuniverse.domain.game.engine.infra.AssetTokens;
import es.pokemonuniverse.domain.game.engine.infra.GuessAttemptOutcome;
import es.pokemonuniverse.domain.game.engine.infra.GuessLastAttempt;
import es.pokemonuniverse.domain.game.engine.infra.GuessPlayerStats;
import es.pokemonuniverse.domain.game.engine.infra.GuessPokemonSummary;
import es.pokemonuniverse.domain.game.engine.infra.GuessingRound;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.SpeedPodiumScore;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonAction;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonAttempt;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonHint;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonPlayerState;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonPublicPokemon;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonPublicState;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonRoundPokemon;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonRoundPublicResult;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonRoundResult;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonSolve;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonSolvedPlayer;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonState;
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

/** Traducción literal del TS que antes estaba en {@code whos-that-pokemon/server.ts}. */
public final class WhosThatPokemonEngine implements
    GameEngine<WhosThatPokemonConfig, WhosThatPokemonState, WhosThatPokemonAction, WhosThatPokemonPublicState> {

  public static final String ID = "whos-that-pokemon";
  public static final long COOLDOWN_MS = 1_000;
  public static final long REVEAL_MS = 4_000;

  private final GameManifest manifest;

  /** {@code handleTimeout}: ciclo común con {@code tickActive}, que revela las pistas según su calendario. */
  private static final TimedRoundStrategy<WhosThatPokemonState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public WhosThatPokemonState beginNext(WhosThatPokemonState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public WhosThatPokemonState resolveActive(WhosThatPokemonState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public WhosThatPokemonState finish(WhosThatPokemonState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(WhosThatPokemonState state) {
      return state.roundNumber() >= state.config().rounds();
    }

    @Override
    public WhosThatPokemonState tickActive(WhosThatPokemonState current, GameContext context) {
      var deadline = current.nextTransitionAt();
      if (!current.config().hintsEnabled() || deadline == null || context.now() < deadline) return current;
      var target = context.pokemon().byId(Objects.requireNonNullElse(current.targetPokemonId(), ""));
      if (target.isEmpty()) return current;
      var hints = WhosThatPokemonRules.buildWhoPokemonHints(target.get());
      var schedule = WhosThatPokemonRules.whoPokemonHintSchedule(
          Objects.requireNonNull(current.roundStartedAt(), "roundStartedAt"), current.config().roundSeconds(),
          hints.size());
      int revealedHintCount = (int) schedule.stream().filter(at -> context.now() >= at).count();
      return current.toBuilder()
          .revealedHintCount(revealedHintCount)
          .nextTransitionAt(revealedHintCount < schedule.size() ? schedule.get(revealedHintCount) : null)
          .build();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public WhosThatPokemonEngine(GameManifest manifest) {
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
  public WhosThatPokemonConfig parseConfig(JsonNode raw) {
    return WhosThatPokemonConfig.parse(raw);
  }

  @Override
  public WhosThatPokemonAction parseAction(JsonNode raw) {
    return WhosThatPokemonAction.parse(raw);
  }

  @Override
  public WhosThatPokemonConfig defaultConfig() {
    return WhosThatPokemonConfig.defaults();
  }

  /** {@code assetPath}: ruta opaca de la silueta o la revelación; {@code roomCode ?? 'opaque'}. */
  private static String assetPath(WhosThatPokemonState state, GameContext context, String assetId) {
    return AssetTokens.roundAssetPath(Objects.requireNonNullElse(context.roomCode(), "opaque"), state.assetToken(),
        state.roundNumber(), assetId, "sprite");
  }

  /** {@code whosThatPokemonPool}. */
  static List<Pokemon> pool(WhosThatPokemonConfig config, GameContext context) {
    return context.pokemon().forGenerations(config.generations(), config.includeRegionalForms()).stream()
        .filter(WhosThatPokemonRules::isUsableWhoPokemonSprite)
        .toList();
  }

  private static Optional<Pokemon> target(WhosThatPokemonState state, GameContext context) {
    return context.pokemon().byId(Objects.requireNonNullElse(state.targetPokemonId(), ""));
  }

  private static WhosThatPokemonState beginRound(WhosThatPokemonState state, GameContext context) {
    var allCandidates = new ArrayList<Pokemon>();
    for (var id : state.poolIds()) context.pokemon().byId(id).ifPresent(allCandidates::add);
    if (allCandidates.isEmpty()) {
      throw new EngineException("No hay Pokémon con sprites válidos para esta configuración.");
    }
    var candidates = Randoms.preferUnused(allCandidates, pokemon -> state.usedPokemonIds().contains(pokemon.id()));
    var target = Randoms.randomItem(candidates, context.random());
    long roundStartedAt = context.now();
    long roundEndsAt = roundStartedAt + state.config().roundSeconds() * 1_000L;
    var hints = state.config().hintsEnabled() ? WhosThatPokemonRules.buildWhoPokemonHints(target) : List.of();
    var hintSchedule = WhosThatPokemonRules.whoPokemonHintSchedule(roundStartedAt, state.config().roundSeconds(),
        hints.size());
    if (context.preloadImage() != null) context.preloadImage().accept(target.sprite());
    var usedPokemonIds = new ArrayList<>(state.usedPokemonIds());
    if (!usedPokemonIds.contains(target.id())) usedPokemonIds.add(target.id());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .targetPokemonId(target.id())
        .usedPokemonIds(usedPokemonIds)
        .attempts(List.of())
        .attemptCounts(Map.of())
        .solves(Map.of())
        .cooldownUntil(Map.of())
        .lastAttemptResult(Map.of())
        .revealedHintCount(0)
        .roundStartedAt(roundStartedAt)
        .roundEndsAt(roundEndsAt)
        .nextTransitionAt(hintSchedule.isEmpty() ? null : hintSchedule.getFirst())
        .lastRound(null)
        .build();
  }

  private static WhosThatPokemonState resolveRound(WhosThatPokemonState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var target = target(state, context)
        .orElseThrow(() -> new EngineException("El Pokémon objetivo ya no está disponible."));
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : state.playerIds()) {
      if (!state.solves().containsKey(playerId)) {
        playerStats.put(playerId, playerStats.getOrDefault(playerId, GuessPlayerStats.ZERO).afterMiss());
      }
    }
    // Quien no acierta la ronda pierde la racha.
    var streaks = new LinkedHashMap<>(state.streaks());
    if (state.config().streakBonus()) {
      for (var playerId : state.playerIds()) {
        if (!state.solves().containsKey(playerId)) streaks.put(playerId, 0);
      }
    }
    var lastRound = new WhosThatPokemonRoundResult(
        new WhosThatPokemonRoundPokemon(target.id(), target.name(), target.sprite(), target.generation()),
        new LinkedHashMap<>(state.solves()), new LinkedHashMap<>(state.attemptCounts()));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .streaks(streaks)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static WhosThatPokemonState resolveIfComplete(WhosThatPokemonState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), WhosThatPokemonEngine::resolveRound);
  }

  private static @Nullable WhosThatPokemonRoundPublicResult publicRoundResult(WhosThatPokemonState state,
      GameContext context) {
    var lastRound = state.lastRound();
    if (lastRound == null || state.phase() != GamePhase.ROUND_RESULTS && state.phase() != GamePhase.GAME_RESULTS) {
      return null;
    }
    return new WhosThatPokemonRoundPublicResult(
        new WhosThatPokemonPublicPokemon(lastRound.pokemon().name(), lastRound.pokemon().generation(),
            assetPath(state, context, "reveal")),
        lastRound.solves(), lastRound.attemptCounts());
  }

  @Override
  public WhosThatPokemonState createInitialState(WhosThatPokemonConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var pool = pool(config, context);
    if (pool.isEmpty()) {
      throw new EngineException("No hay Pokémon con sprites válidos en las generaciones seleccionadas.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var assetToken = AssetTokens.randomToken(context);
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, GuessPlayerStats>();
    for (var id : playerIds) scores.put(id, 0);
    for (var id : playerIds) playerStats.put(id, GuessPlayerStats.ZERO);
    return WhosThatPokemonState.builder()
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

  @Override
  public WhosThatPokemonState start(WhosThatPokemonState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<WhosThatPokemonState> handleAction(WhosThatPokemonState state, String playerId,
      WhosThatPokemonAction action, GameContext context) {
    var rejected = GuessingRound.precheck(state, playerId, context, "Ya has acertado esta ronda.",
        expired -> resolveRound(expired, context));
    if (rejected != null) return rejected;
    var found = context.pokemon().byId(action.pokemonId());
    if (found.isEmpty() || !state.poolIds().contains(found.get().id())) {
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
    }
    var guessed = found.get();
    int attemptCount = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var stats = state.playerStats().getOrDefault(playerId, GuessPlayerStats.ZERO);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attemptCount);
    var lastAttemptResult = new LinkedHashMap<>(state.lastAttemptResult());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    if (guessed.id().equals(state.targetPokemonId())) {
      long roundStartedAt = Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
      long elapsedMs = context.now() - roundStartedAt;
      int solveOrder = state.solves().size() + 1;
      var score = SpeedPodiumScore.of(roundStartedAt, state.config().roundSeconds(), context.now(),
          solveOrder);
      // Racha: los aciertos seguidos de este jugador, este incluido (solo con la opción).
      var streaks = new LinkedHashMap<>(state.streaks());
      Integer streakBonus = null;
      if (state.config().streakBonus()) {
        int streak = streaks.getOrDefault(playerId, 0) + 1;
        streaks.put(playerId, streak);
        streakBonus = SpeedPodiumScore.streakBonus(streak);
      }
      int points = score.totalPoints() + (streakBonus == null ? 0 : streakBonus);
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId,
          WhosThatPokemonSolve.of(solveOrder, context.now(), elapsedMs, score, attemptCount, streakBonus));
      lastAttemptResult.put(playerId, new GuessLastAttempt(GuessAttemptOutcome.CORRECT, context.now()));
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + points);
      playerStats.put(playerId, GuessingRound.recordGuessSolve(stats, attemptCount, solveOrder, elapsedMs, points));
      var next = state.toBuilder()
          .attemptCounts(attemptCounts)
          .solves(solves)
          .lastAttemptResult(lastAttemptResult)
          .scores(scores)
          .playerStats(playerStats)
          .streaks(streaks)
          .build();
      return GameActionResult.accept(resolveIfComplete(next, context));
    }
    var attempts = new ArrayList<>(state.attempts());
    attempts.add(new WhosThatPokemonAttempt(playerId, GuessPokemonSummary.of(guessed), context.now()));
    lastAttemptResult.put(playerId, new GuessLastAttempt(GuessAttemptOutcome.INCORRECT, context.now()));
    playerStats.put(playerId, stats.afterWrongAttempt());
    return GameActionResult.accept(state.toBuilder()
        .attempts(attempts)
        .attemptCounts(attemptCounts)
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(), COOLDOWN_MS))
        .lastAttemptResult(lastAttemptResult)
        .playerStats(playerStats)
        .build());
  }

  @Override
  public WhosThatPokemonState handleTimeout(WhosThatPokemonState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public WhosThatPokemonState handlePresenceChange(WhosThatPokemonState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public WhosThatPokemonPublicState getPublicState(WhosThatPokemonState state, GameContext context) {
    var target = target(state, context);
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE;
    List<WhosThatPokemonHint> visibleHints = active && state.config().hintsEnabled() && target.isPresent()
        ? sliceHints(WhosThatPokemonRules.buildWhoPokemonHints(target.get()), state.revealedHintCount())
        : List.of();
    var solvedPlayers = state.solves().entrySet().stream()
        .map(entry -> new WhosThatPokemonSolvedPlayer(entry.getKey(), entry.getValue().solveOrder()))
        .sorted(Comparator.comparingInt(WhosThatPokemonSolvedPlayer::solveOrder))
        .toList();
    return new WhosThatPokemonPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        active && target.isPresent() ? assetPath(state, context, "shadow") : null,
        visibleHints, GuessingRound.publicAttempts(state.config().publicAttempts(), state.attempts()),
        solvedPlayers, state.scores(), state.roundStartedAt(), state.roundEndsAt(),
        state.nextTransitionAt(), publicRoundResult(state, context),
        state.phase() == GamePhase.GAME_RESULTS ? WhosThatPokemonRules.buildWhoPokemonResults(state) : null);
  }

  /** {@code hints.slice(0, count)}. */
  private static List<WhosThatPokemonHint> sliceHints(List<WhosThatPokemonHint> hints, int count) {
    return List.copyOf(hints.subList(0, Math.max(0, Math.min(count, hints.size()))));
  }

  @Override
  public WhosThatPokemonPlayerState getPlayerState(WhosThatPokemonState state, String playerId, GameContext context) {
    var solve = state.solves().get(playerId);
    return new WhosThatPokemonPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId) && solve == null,
        solve != null,
        solve == null ? null : solve.solveOrder(),
        state.cooldownUntil().get(playerId),
        solve == null ? 0 : solve.points(),
        state.attemptCounts().getOrDefault(playerId, 0),
        state.lastAttemptResult().get(playerId),
        GuessingRound.ownAttempts(state.config().publicAttempts(), state.attempts(),
            WhosThatPokemonAttempt::playerId, playerId),
        state.config().streakBonus() ? state.streaks().getOrDefault(playerId, 0) : null);
  }

  /**
   * {@code shadow} da la silueta en cualquier fase de la ronda pedida; {@code reveal}, el sprite original solo en
   * resultados. Un token o una ronda distintos no resuelven nada.
   */
  @Override
  public Optional<AssetResolution> resolveAsset(WhosThatPokemonState state, AssetRequest request,
      GameContext context) {
    if (!state.assetToken().equals(request.assetToken()) || state.roundNumber() != request.roundNumber()) {
      return Optional.empty();
    }
    var target = target(state, context);
    if (target.isEmpty()) return Optional.empty();
    if ("shadow".equals(request.assetId())) {
      return Optional.of(new AssetResolution(target.get().sprite(), AssetResolution.Transform.SILHOUETTE, null, null,
          null));
    }
    if ("reveal".equals(request.assetId())
        && (state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS)) {
      return Optional.of(AssetResolution.original(target.get().sprite()));
    }
    return Optional.empty();
  }

  @Override
  public GameLifecycle getLifecycle(WhosThatPokemonState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(WhosThatPokemonState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(WhosThatPokemonState state) {
    return WhosThatPokemonRules.buildWhoPokemonResults(state);
  }
}
