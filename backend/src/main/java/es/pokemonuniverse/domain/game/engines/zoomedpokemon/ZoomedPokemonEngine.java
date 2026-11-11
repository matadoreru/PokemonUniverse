package es.pokemonuniverse.domain.game.engines.zoomedpokemon;

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
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog.Source;
import es.pokemonuniverse.domain.game.engine.infra.AssetTokens;
import es.pokemonuniverse.domain.game.engine.infra.GuessingRound;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonConfig.ImageMode;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomStage;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonAction;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonAttempt;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonAttemptOutcome;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonFocusPoint;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonHint;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonLastAttempt;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonPlayerState;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonPlayerStats;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonPokemonSummary;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonPublicPokemon;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonPublicSolve;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonPublicState;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonRoundPokemon;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonRoundPublicResult;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonRoundResult;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonSolve;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonState;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonVisual;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/** Traducción literal de {@code zoomed-pokemon/server.ts}. */
public final class ZoomedPokemonEngine
    implements GameEngine<ZoomedPokemonConfig, ZoomedPokemonState, ZoomedPokemonAction, ZoomedPokemonPublicState> {

  public static final String ID = "zoomed-pokemon";
  public static final long COOLDOWN_MS = 1_000;
  public static final long REVEAL_MS = 4_000;
  /** {@code .slice(-80)} de los intentos fallidos públicos. */
  public static final int MAX_RECENT_ATTEMPTS = 80;

  /** {@code /^stage-([0-3])$/} con {@link java.util.regex.Matcher#matches()}: sin el {@code $} multilínea de Java. */
  private static final Pattern STAGE_ASSET = Pattern.compile("stage-([0-3])");

  private final GameManifest manifest;

  /** {@code handleTimeout}: ciclo común con {@code tickActive}, que acerca la cámara según el calendario de etapas. */
  private static final TimedRoundStrategy<ZoomedPokemonState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public ZoomedPokemonState beginNext(ZoomedPokemonState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public ZoomedPokemonState resolveActive(ZoomedPokemonState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public ZoomedPokemonState finish(ZoomedPokemonState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(ZoomedPokemonState state) {
      return state.roundNumber() >= state.config().rounds();
    }

    @Override
    public ZoomedPokemonState tickActive(ZoomedPokemonState current, GameContext context) {
      long roundStartedAt = Objects.requireNonNull(current.roundStartedAt(), "roundStartedAt");
      int currentZoomStage = ZoomedPokemonRules.zoomStageAt(roundStartedAt, current.config().roundSeconds(),
          context.now());
      if (currentZoomStage == current.currentZoomStage()) return current;
      var schedule = ZoomedPokemonRules.zoomStageSchedule(roundStartedAt, current.config().roundSeconds());
      return current.toBuilder()
          .currentZoomStage(currentZoomStage)
          .nextTransitionAt(currentZoomStage < schedule.size() ? schedule.get(currentZoomStage) : null)
          .build();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public ZoomedPokemonEngine(GameManifest manifest) {
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
  public ZoomedPokemonConfig parseConfig(JsonNode raw) {
    return ZoomedPokemonConfig.parse(raw);
  }

  @Override
  public ZoomedPokemonAction parseAction(JsonNode raw) {
    return ZoomedPokemonAction.parse(raw);
  }

  @Override
  public ZoomedPokemonConfig defaultConfig() {
    return ZoomedPokemonConfig.defaults();
  }

  /** {@code spriteAsset}: el sprite del catálogo como recurso visual. */
  private static PokemonVisualCatalog.Asset spriteAsset(Pokemon pokemon) {
    return new PokemonVisualCatalog.Asset(pokemon.id(), Source.SPRITE, pokemon.sprite(), null, null, null);
  }

  /** {@code assetPath}: ruta opaca de un recorte o de la revelación; {@code roomCode ?? 'opaque'}. */
  private static String assetPath(ZoomedPokemonState state, GameContext context, String assetId) {
    return AssetTokens.roundAssetPath(Objects.requireNonNullElse(context.roomCode(), "opaque"), state.assetToken(),
        state.roundNumber(), assetId, "sprite");
  }

  /** {@code artworkIds}: {@code context.pokemonVisuals?.artworkPokemonIds() ?? []}. */
  private static Set<String> artworkIds(GameContext context) {
    var visuals = context.pokemonVisuals();
    return visuals == null ? Set.of() : new HashSet<>(visuals.artworkPokemonIds());
  }

  /** {@code zoomedPokemonPool}. */
  static List<Pokemon> pool(ZoomedPokemonConfig config, GameContext context) {
    var arts = artworkIds(context);
    return context.pokemon().forGenerations(config.generations(), config.includeForms()).stream()
        .filter(pokemon -> {
          boolean sprite = ZoomedPokemonRules.isUsableZoomedSprite(pokemon);
          if (config.imageMode() == ImageMode.SPRITE) return sprite;
          if (config.imageMode() == ImageMode.ARTWORK) return arts.contains(pokemon.id());
          return sprite || arts.contains(pokemon.id());
        })
        .filter(pokemon -> ZoomedPokemonRules.supportsArtwork(config, pokemon.id(), arts))
        .toList();
  }

  /** {@code chooseVisual}: consume un {@code random()} para {@code focusSeed} ({@code floor(r * 0x7fff_ffff)}). */
  private static ZoomedPokemonVisual chooseVisual(ZoomedPokemonConfig config, Pokemon pokemon, GameContext context) {
    var visuals = context.pokemonVisuals();
    var artwork = visuals == null ? null : visuals.artworkFor(pokemon.id());
    boolean usableSprite = ZoomedPokemonRules.isUsableZoomedSprite(pokemon);
    PokemonVisualCatalog.Asset selected;
    if (config.imageMode() == ImageMode.ARTWORK) selected = artwork;
    else if (config.imageMode() == ImageMode.SPRITE) selected = usableSprite ? spriteAsset(pokemon) : null;
    else selected = artwork != null ? artwork : usableSprite ? spriteAsset(pokemon) : null;
    if (selected == null) throw new EngineException("El Pokémon seleccionado no dispone de una imagen válida.");
    return new ZoomedPokemonVisual(pokemon.id(), selected.source(), selected.location(),
        (long) Math.floor(context.random().getAsDouble() * 2147483647.0));
  }

  private static EngineException noImages(ZoomedPokemonConfig config) {
    return new EngineException(config.imageMode() == ImageMode.ARTWORK
        ? "No hay artworks disponibles para las generaciones seleccionadas."
        : "No hay imágenes válidas para las generaciones seleccionadas.");
  }

  private static Optional<Pokemon> target(ZoomedPokemonState state, GameContext context) {
    return context.pokemon().byId(Objects.requireNonNullElse(state.targetPokemonId(), ""));
  }

  private static ZoomedPokemonState beginRound(ZoomedPokemonState state, GameContext context) {
    var allCandidates = new ArrayList<Pokemon>();
    for (var id : state.poolIds()) context.pokemon().byId(id).ifPresent(allCandidates::add);
    if (allCandidates.isEmpty()) throw noImages(state.config());
    List<Pokemon> candidates = allCandidates.stream()
        .filter(pokemon -> !state.usedPokemonIds().contains(pokemon.id()))
        .toList();
    if (candidates.isEmpty()) candidates = allCandidates;
    var target = Randoms.randomItem(candidates, context.random());
    var visual = chooseVisual(state.config(), target, context);
    long roundStartedAt = context.now();
    var schedule = ZoomedPokemonRules.zoomStageSchedule(roundStartedAt, state.config().roundSeconds());
    if (context.preloadImage() != null) context.preloadImage().accept(visual.location());
    var usedPokemonIds = new ArrayList<>(state.usedPokemonIds());
    if (!usedPokemonIds.contains(target.id())) usedPokemonIds.add(target.id());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .targetPokemonId(target.id())
        .visual(visual)
        .usedPokemonIds(usedPokemonIds)
        .attempts(List.of())
        .attemptCounts(Map.of())
        .solves(Map.of())
        .cooldownUntil(Map.of())
        .lastAttemptResult(Map.of())
        .currentZoomStage(0)
        .roundStartedAt(roundStartedAt)
        .roundEndsAt(roundStartedAt + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(schedule.isEmpty() ? null : schedule.getFirst())
        .lastRound(null)
        .build();
  }

  private static ZoomedPokemonState resolveRound(ZoomedPokemonState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var found = target(state, context);
    if (found.isEmpty() || state.visual() == null) {
      throw new EngineException("El objetivo visual ya no está disponible.");
    }
    var target = found.get();
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : state.playerIds()) {
      if (!state.solves().containsKey(playerId)) {
        playerStats.put(playerId, playerStats.getOrDefault(playerId, ZoomedPokemonPlayerStats.ZERO).afterMiss());
      }
    }
    var lastRound = new ZoomedPokemonRoundResult(
        new ZoomedPokemonRoundPokemon(target.id(), target.name(), target.generation()), state.visual().source(),
        new LinkedHashMap<>(state.solves()), new LinkedHashMap<>(state.attemptCounts()));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static ZoomedPokemonState resolveIfComplete(ZoomedPokemonState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), ZoomedPokemonEngine::resolveRound);
  }

  @Override
  public ZoomedPokemonState createInitialState(ZoomedPokemonConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var pool = pool(config, context);
    if (pool.isEmpty()) throw noImages(config);
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var guessPoolIds = context.pokemon().forGenerations(config.generations(), config.includeForms()).stream()
        .map(Pokemon::id)
        .toList();
    var assetToken = AssetTokens.randomToken(context);
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, ZoomedPokemonPlayerStats>();
    for (var id : playerIds) scores.put(id, 0);
    for (var id : playerIds) playerStats.put(id, ZoomedPokemonPlayerStats.ZERO);
    return ZoomedPokemonState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .assetToken(assetToken)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .guessPoolIds(guessPoolIds)
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .currentZoomStage(0)
        .build();
  }

  @Override
  public ZoomedPokemonState start(ZoomedPokemonState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<ZoomedPokemonState> handleAction(ZoomedPokemonState state, String playerId,
      ZoomedPokemonAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
    }
    if (state.solves().containsKey(playerId)) return GameActionResult.reject(state, "Ya has acertado esta ronda.");
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      // Rechazo que también resuelve la ronda, como el { state: resolveRound(...), accepted: false } de TS.
      return GameActionResult.reject(resolveRound(state, context), "El tiempo ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var found = context.pokemon().byId(action.pokemonId());
    if (found.isEmpty() || !state.guessPoolIds().contains(found.get().id())) {
      return GameActionResult.reject(state, "Ese Pokémon o forma no pertenece al pool configurado.");
    }
    var guessed = found.get();
    int attemptCount = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var stats = state.playerStats().getOrDefault(playerId, ZoomedPokemonPlayerStats.ZERO);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attemptCount);
    var lastAttemptResult = new LinkedHashMap<>(state.lastAttemptResult());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    if (guessed.id().equals(state.targetPokemonId())) {
      long roundStartedAt = Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
      int solveOrder = state.solves().size() + 1;
      long elapsedMs = context.now() - roundStartedAt;
      int zoomStage = ZoomedPokemonRules.zoomStageAt(roundStartedAt, state.config().roundSeconds(), context.now());
      int zoomBonus = ZoomedPokemonRules.zoomBonusForStage(zoomStage);
      int points = ZoomedPokemonRules.zoomedPoints(state.playerIds().size(), solveOrder, zoomStage);
      var source = state.visual() == null ? Source.SPRITE : state.visual().source();
      var stage = new ZoomStage(zoomStage, ZoomedPokemonRules.ZOOM_STAGES.get(zoomStage), zoomBonus);
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId, ZoomedPokemonSolve.of(context.now(), elapsedMs, solveOrder, stage, points, attemptCount));
      lastAttemptResult.put(playerId, new ZoomedPokemonLastAttempt(ZoomedPokemonAttemptOutcome.CORRECT, context.now()));
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + points);
      playerStats.put(playerId, stats.afterSolve(attemptCount, solveOrder, elapsedMs, zoomStage, points, source));
      var next = state.toBuilder()
          .attemptCounts(attemptCounts)
          .solves(solves)
          .lastAttemptResult(lastAttemptResult)
          .scores(scores)
          .playerStats(playerStats)
          .build();
      return GameActionResult.accept(resolveIfComplete(next, context));
    }
    var attempts = new ArrayList<>(state.attempts());
    attempts.add(new ZoomedPokemonAttempt(playerId, ZoomedPokemonPokemonSummary.of(guessed), context.now()));
    lastAttemptResult.put(playerId, new ZoomedPokemonLastAttempt(ZoomedPokemonAttemptOutcome.INCORRECT, context.now()));
    playerStats.put(playerId, stats.afterWrongAttempt());
    return GameActionResult.accept(state.toBuilder()
        .attempts(attempts.subList(Math.max(0, attempts.size() - MAX_RECENT_ATTEMPTS), attempts.size()))
        .attemptCounts(attemptCounts)
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(), COOLDOWN_MS))
        .lastAttemptResult(lastAttemptResult)
        .playerStats(playerStats)
        .build());
  }

  @Override
  public ZoomedPokemonState handleTimeout(ZoomedPokemonState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public ZoomedPokemonState handlePresenceChange(ZoomedPokemonState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public ZoomedPokemonPublicState getPublicState(ZoomedPokemonState state, GameContext context) {
    var target = target(state, context);
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE && state.visual() != null;
    var lastRound = state.lastRound();
    var publicLastRound = lastRound != null
        && (state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS)
        ? new ZoomedPokemonRoundPublicResult(
            new ZoomedPokemonPublicPokemon(lastRound.pokemon().name(), lastRound.pokemon().generation()),
            assetPath(state, context, "reveal"), assetPath(state, context, "stage-0"), lastRound.imageSourceType(),
            lastRound.solves(), lastRound.attemptCounts())
        : null;
    List<ZoomedPokemonHint> visibleHints = active && state.config().hintsEnabled() && target.isPresent()
        ? ZoomedPokemonRules.buildZoomedHints(target.get(), state.config().hintKinds())
        : List.of();
    var solves = new LinkedHashMap<String, ZoomedPokemonPublicSolve>();
    state.solves().forEach((id, solve) -> solves.put(id, new ZoomedPokemonPublicSolve(solve.solveOrder(),
        solve.zoomStage())));
    return new ZoomedPokemonPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        active ? assetPath(state, context, "stage-" + state.currentZoomStage()) : null,
        active ? state.visual().source() : null, ZoomedPokemonFocusPoint.CENTER, ZoomedPokemonRules.ZOOM_STAGES,
        state.currentZoomStage(), ZoomedPokemonRules.zoomBonusForStage(state.currentZoomStage()), visibleHints,
        GuessingRound.publicAttempts(state.config().publicAttempts(), state.attempts()),
        solves, state.scores(), state.roundStartedAt(), state.roundEndsAt(),
        state.nextTransitionAt(), publicLastRound,
        state.phase() == GamePhase.GAME_RESULTS ? ZoomedPokemonRules.buildZoomedPokemonResults(state) : null);
  }

  @Override
  public ZoomedPokemonPlayerState getPlayerState(ZoomedPokemonState state, String playerId, GameContext context) {
    var solve = state.solves().get(playerId);
    return new ZoomedPokemonPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId) && solve == null,
        solve != null,
        solve == null ? null : solve.solveOrder(),
        state.cooldownUntil().get(playerId),
        solve == null ? 0 : solve.points(),
        state.attemptCounts().getOrDefault(playerId, 0),
        state.lastAttemptResult().get(playerId),
        GuessingRound.ownAttempts(state.config().publicAttempts(), state.attempts(),
            ZoomedPokemonAttempt::playerId, playerId));
  }

  /**
   * {@code stage-N} da el recorte {@code ZOOM_CROP} con el {@code focusSeed} de la ronda (en juego, solo hasta la etapa
   * actual); {@code reveal} da la imagen {@code NORMALIZED} en resultados. No lee el contexto, como el TS.
   */
  @Override
  public Optional<AssetResolution> resolveAsset(ZoomedPokemonState state, AssetRequest request, GameContext context) {
    var visual = state.visual();
    if (!state.assetToken().equals(request.assetToken()) || state.roundNumber() != request.roundNumber()
        || visual == null) {
      return Optional.empty();
    }
    var match = STAGE_ASSET.matcher(request.assetId());
    if (match.matches() && (state.phase() == GamePhase.ROUND_ACTIVE || state.phase() == GamePhase.ROUND_RESULTS
        || state.phase() == GamePhase.GAME_RESULTS)) {
      int stage = Integer.parseInt(match.group(1));
      if (state.phase() == GamePhase.ROUND_ACTIVE && stage > state.currentZoomStage()) return Optional.empty();
      return Optional.of(new AssetResolution(visual.location(), AssetResolution.Transform.ZOOM_CROP,
          visual.focusSeed(), ZoomedPokemonRules.ZOOM_STAGES.get(stage), null));
    }
    if ("reveal".equals(request.assetId())
        && (state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS)) {
      return Optional.of(new AssetResolution(visual.location(), AssetResolution.Transform.NORMALIZED, null, null,
          null));
    }
    return Optional.empty();
  }

  @Override
  public GameLifecycle getLifecycle(ZoomedPokemonState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(ZoomedPokemonState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(ZoomedPokemonState state) {
    return ZoomedPokemonRules.buildZoomedPokemonResults(state);
  }
}
