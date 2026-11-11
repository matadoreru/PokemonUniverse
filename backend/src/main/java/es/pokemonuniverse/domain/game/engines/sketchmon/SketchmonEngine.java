package es.pokemonuniverse.domain.game.engines.sketchmon;

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
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonAction;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonAttempt;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonDrawOperation;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonDrawerPokemon;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonGalleryEntry;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonGuessedPokemon;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonHint;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonPlayerState;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonPlayerStats;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonPokemonReveal;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonPublicState;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonRoundReason;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonRoundResult;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonState;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonStroke;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** Traducción literal de {@code sketchmon/server.ts}. */
public final class SketchmonEngine
    implements GameEngine<SketchmonConfig, SketchmonState, SketchmonAction, SketchmonPublicState> {

  public static final String ID = "sketchmon";
  /** {@code SKETCHMON_GUESS_COOLDOWN_MS}. */
  public static final long GUESS_COOLDOWN_MS = 750;
  /** {@code SKETCHMON_REVEAL_MS}. */
  public static final long REVEAL_MS = 6_000;
  /** {@code SKETCHMON_SPRITE_PREVIEW_MS}. */
  public static final long SPRITE_PREVIEW_MS = 3_000;
  /** {@code SKETCHMON_MAX_POINTS}: puntos de todo el lienzo. */
  public static final int MAX_POINTS = 16_384;
  /** {@code SKETCHMON_MAX_STROKES}. */
  public static final int MAX_STROKES = 1_024;
  /** {@code SKETCHMON_UNDO_LIMIT}: lienzos guardados en cada pila. */
  public static final int UNDO_LIMIT = 64;
  /** {@code SKETCHMON_GALLERY_LIMIT}. */
  public static final int GALLERY_LIMIT = 12;
  /** Fracciones de la ronda en que se revelan las pistas ({@code [1 / 3, 5 / 9, 7 / 9]}). */
  private static final double[] HINT_FRACTIONS = {1.0 / 3, 5.0 / 9, 7.0 / 9};

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public SketchmonEngine(GameManifest manifest) {
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
  public SketchmonConfig parseConfig(JsonNode raw) {
    return SketchmonConfig.parse(raw);
  }

  @Override
  public SketchmonAction parseAction(JsonNode raw) {
    return SketchmonAction.parse(raw);
  }

  @Override
  public SketchmonConfig defaultConfig() {
    return SketchmonConfig.defaults();
  }

  /** {@code drawerOrder}: una vuelta barajada por cada {@code laps}, en orden. */
  private static List<String> drawerOrder(List<String> playerIds, int laps, GameContext context) {
    var order = new ArrayList<String>();
    for (int lap = 0; lap < laps; lap++) order.addAll(Randoms.shuffled(playerIds, context.random()));
    return order;
  }

  /** {@code sketchmonPool}: con id, nombre y sprite; las formas solo con {@code includeForms}. */
  static List<Pokemon> pool(SketchmonConfig config, GameContext context) {
    return context.pokemon().forGenerations(config.generations(), config.includeForms()).stream()
        .filter(pokemon -> !blank(pokemon.id()) && !blank(pokemon.name()) && !blank(pokemon.sprite())
            && (config.includeForms() || pokemon.isDefault()))
        .toList();
  }

  private static boolean blank(@Nullable String value) {
    return value == null || value.isEmpty();
  }

  /** {@code sketchmonHintDeadlines}: {@code Math.round} de JS y de Java redondean igual (mitades hacia +∞). */
  static List<Long> hintDeadlines(long roundStartedAt, int roundSeconds) {
    long duration = roundSeconds * 1_000L;
    var deadlines = new ArrayList<Long>();
    for (double fraction : HINT_FRACTIONS) deadlines.add(roundStartedAt + Math.round(duration * fraction));
    return deadlines;
  }

  /** {@code evolutionHint}: solo un {@code undefined} cuenta como desconocido (no un 0). */
  private static String evolutionHint(Pokemon pokemon) {
    var stage = pokemon.evolutionStage();
    var stageCount = pokemon.evolutionStageCount();
    if (stage == null || stageCount == null) return "Evolución desconocida";
    if (stageCount <= 1) return "No evoluciona";
    if (stage >= stageCount) return "Evolución final";
    if (stage <= 1) return "Primera etapa evolutiva";
    return "Etapa " + stage + " de " + stageCount;
  }

  private static List<SketchmonHint> hintsFor(Pokemon pokemon) {
    return List.of(new SketchmonHint.Generation(pokemon.generation()), new SketchmonHint.Types(pokemon.types()),
        new SketchmonHint.Evolution(evolutionHint(pokemon)));
  }

  private static Optional<Pokemon> target(SketchmonState state, GameContext context) {
    return context.pokemon().byId(Objects.requireNonNullElse(state.targetPokemonId(), ""));
  }

  /**
   * {@code advanceHints}: revela las pistas vencidas y fija la siguiente transición (la próxima pista o el fin de la
   * vista previa). Sin cambios devuelve el mismo estado.
   */
  private static SketchmonState advanceHints(SketchmonState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.roundStartedAt() == null) return state;
    long roundStartedAt = state.roundStartedAt();
    var target = target(state, context);
    List<Long> deadlines = state.config().hintsEnabled()
        ? hintDeadlines(roundStartedAt, state.config().roundSeconds())
        : List.of();
    int revealedCount = (int) deadlines.stream().filter(deadline -> context.now() >= deadline).count();
    var pending = new ArrayList<Long>();
    if (revealedCount < deadlines.size()) pending.add(deadlines.get(revealedCount));
    if (state.config().memoryPreviewEnabled() && context.now() < roundStartedAt + SPRITE_PREVIEW_MS) {
      pending.add(roundStartedAt + SPRITE_PREVIEW_MS);
    }
    Long nextTransitionAt = pending.isEmpty() ? null : pending.stream().min(Long::compare).orElseThrow();
    List<SketchmonHint> visibleHints = target.isPresent() && state.config().hintsEnabled()
        ? hintsFor(target.get()).subList(0, revealedCount)
        : state.visibleHints();
    if (visibleHints.size() == state.visibleHints().size()
        && Objects.equals(nextTransitionAt, state.nextTransitionAt())) {
      return state;
    }
    return state.toBuilder().visibleHints(visibleHints).nextTransitionAt(nextTransitionAt).build();
  }

  /** {@code incrementDrawingFailure}: ronda cancelada o saltada para quien debía dibujar. */
  private static SketchmonState incrementDrawingFailure(SketchmonState state, String drawerId) {
    var stats = state.playerStats().getOrDefault(drawerId, SketchmonPlayerStats.ZERO);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(drawerId, stats.afterDrawing(false, 0));
    return state.toBuilder().playerStats(playerStats).build();
  }

  /** {@code finish}. */
  private static SketchmonState finish(SketchmonState state) {
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .targetPokemonId(null)
        .drawerId(null)
        .strokes(List.of())
        .undoStack(List.of())
        .redoStack(List.of())
        .visibleHints(List.of())
        .attempts(List.of())
        .roundStartedAt(null)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  /** {@code selectTarget}: la extracción de {@code random()} ocurre aunque no quede ningún candidato. */
  private static Pokemon selectTarget(SketchmonState state, GameContext context) {
    var pool = new ArrayList<Pokemon>();
    for (var id : state.poolIds()) context.pokemon().byId(id).ifPresent(pool::add);
    var candidates = Randoms.preferUnused(pool, pokemon -> state.usedPokemonIds().contains(pokemon.id()));
    int index = Randoms.randomIndex(candidates.size(), context.random());
    if (candidates.isEmpty()) throw new EngineException("No hay Pokémon disponibles para Sketchmon.");
    return candidates.get(index);
  }

  /**
   * {@code beginNextRound}: salta (como fallo de dibujo) las rondas cuyo dibujante no está conectado y termina la
   * partida cuando no quedan rondas.
   */
  private static SketchmonState beginNextRound(SketchmonState initial, GameContext context) {
    var state = initial;
    int totalRounds = state.drawerOrder().size();
    while (state.roundNumber() < totalRounds) {
      int roundNumber = state.roundNumber() + 1;
      var drawerId = state.drawerOrder().get(roundNumber - 1);
      if (!context.isPlayerRequired(drawerId)) {
        state = incrementDrawingFailure(state.toBuilder().roundNumber(roundNumber).build(), drawerId);
        continue;
      }
      var target = selectTarget(state, context);
      if (context.preloadImage() != null) context.preloadImage().accept(target.sprite());
      long roundStartedAt = context.now();
      Long firstHintAt = state.config().hintsEnabled()
          ? hintDeadlines(roundStartedAt, state.config().roundSeconds()).getFirst()
          : null;
      Long previewEndsAt = state.config().memoryPreviewEnabled() ? roundStartedAt + SPRITE_PREVIEW_MS : null;
      var usedPokemonIds = new ArrayList<>(state.usedPokemonIds());
      if (!usedPokemonIds.contains(target.id())) usedPokemonIds.add(target.id());
      return state.toBuilder()
          .phase(GamePhase.ROUND_ACTIVE)
          .roundNumber(roundNumber)
          .targetPokemonId(target.id())
          .drawerId(drawerId)
          .usedPokemonIds(usedPokemonIds)
          .strokes(List.of())
          .undoStack(List.of())
          .redoStack(List.of())
          .visibleHints(List.of())
          .attempts(List.of())
          .attemptCounts(Map.of())
          .cooldownUntil(Map.of())
          .roundStartedAt(roundStartedAt)
          .roundEndsAt(roundStartedAt + state.config().roundSeconds() * 1_000L)
          .nextTransitionAt(firstHintAt == null ? previewEndsAt
              : previewEndsAt == null ? firstHintAt : Long.valueOf(Math.min(firstHintAt, previewEndsAt)))
          .lastRound(null)
          .build();
    }
    return finish(state);
  }

  /** {@code resolveRound}: puntúa al acertante y a quien dibuja, y guarda el dibujo en la galería. */
  private static SketchmonState resolveRound(SketchmonState state, GameContext context, @Nullable String winnerId) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var target = target(state, context);
    var drawerId = state.drawerId();
    if (target.isEmpty() || drawerId == null || state.roundStartedAt() == null) {
      throw new EngineException("El secreto de Sketchmon ya no está disponible.");
    }
    long elapsedMs = Math.max(0,
        Math.min(state.config().roundSeconds() * 1_000L, context.now() - state.roundStartedAt()));
    var scores = new LinkedHashMap<>(state.scores());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    int guesserPoints = 0;
    int awardedDrawerPoints = 0;
    if (winnerId != null) {
      guesserPoints = SketchmonRules.guesserPoints(elapsedMs);
      awardedDrawerPoints = SketchmonRules.DRAWER_POINTS;
      scores.put(winnerId, scores.getOrDefault(winnerId, 0) + guesserPoints);
      scores.put(drawerId, scores.getOrDefault(drawerId, 0) + awardedDrawerPoints);
      var winnerStats = playerStats.getOrDefault(winnerId, SketchmonPlayerStats.ZERO);
      int attemptCount = state.attemptCounts().getOrDefault(winnerId, 0);
      playerStats.put(winnerId, winnerStats.afterGuess(attemptCount == 1, guesserPoints));
    }
    var drawerStats = playerStats.getOrDefault(drawerId, SketchmonPlayerStats.ZERO);
    playerStats.put(drawerId, drawerStats.afterDrawing(winnerId != null, awardedDrawerPoints));
    var lastRound = SketchmonRoundResult.builder()
        .reason(winnerId != null ? SketchmonRoundReason.GUESSED : SketchmonRoundReason.TIMEOUT)
        .pokemon(SketchmonPokemonReveal.of(target.get()))
        .drawerId(drawerId)
        .winnerId(winnerId)
        .elapsedMs(elapsedMs)
        .guesserPoints(guesserPoints)
        .drawerPoints(awardedDrawerPoints)
        .winnerAttemptCount(winnerId != null ? state.attemptCounts().getOrDefault(winnerId, 0) : null)
        .drawing(state.strokes())
        .build();
    int lapNumber = Math.floorDiv(state.roundNumber() - 1, state.playerIds().size()) + 1;
    var gallery = new ArrayList<>(state.gallery());
    gallery.add(SketchmonGalleryEntry.of(lastRound, state.roundNumber(), lapNumber));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .gallery(lastItems(gallery, GALLERY_LIMIT))
        .build();
  }

  /** {@code list.slice(-limit)}. */
  private static <T> List<T> lastItems(List<T> list, int limit) {
    return list.subList(Math.max(0, list.size() - limit), list.size());
  }

  /** {@code [...stack, canvas].slice(-SKETCHMON_UNDO_LIMIT)}. */
  private static List<List<SketchmonStroke>> push(List<List<SketchmonStroke>> stack, List<SketchmonStroke> canvas) {
    var next = new ArrayList<>(stack);
    next.add(canvas);
    return lastItems(next, UNDO_LIMIT);
  }

  /**
   * {@code applyDrawingBatch}: el lote es atómico; el recuento de puntos parte del lienzo actual y se acumula operación
   * a operación antes de comprobar el resto.
   */
  static GameActionResult<SketchmonState> applyDrawingBatch(SketchmonState state,
      SketchmonAction.DrawBatch action) {
    var strokes = state.strokes();
    var undoStack = state.undoStack();
    var redoStack = state.redoStack();
    long pointCount = strokes.stream().mapToLong(stroke -> stroke.points().size()).sum();
    for (var operation : action.operations()) {
      pointCount += operation.pointCount();
      if (pointCount > MAX_POINTS) {
        return GameActionResult.reject(state,
            "El dibujo ha alcanzado el límite de puntos. Borra trazos antes de continuar.");
      }
      switch (operation) {
        case SketchmonDrawOperation.Start start -> {
          var id = start.stroke().id();
          if (strokes.stream().anyMatch(stroke -> stroke.id().equals(id))) {
            return GameActionResult.reject(state, "Ese trazo ya existe.");
          }
          if (strokes.size() >= MAX_STROKES) {
            return GameActionResult.reject(state, "El dibujo ha alcanzado el límite de trazos.");
          }
          undoStack = push(undoStack, strokes);
          redoStack = List.of();
          var next = new ArrayList<>(strokes);
          next.add(start.stroke());
          strokes = List.copyOf(next);
        }
        case SketchmonDrawOperation.Append append -> {
          if (strokes.stream().noneMatch(stroke -> stroke.id().equals(append.strokeId()))) {
            return GameActionResult.reject(state, "No se puede continuar un trazo inexistente.");
          }
          strokes = strokes.stream()
              .map(stroke -> stroke.id().equals(append.strokeId()) ? stroke.withAppended(append.points()) : stroke)
              .toList();
        }
      }
    }
    return GameActionResult.accept(state.toBuilder().strokes(strokes).undoStack(undoStack).redoStack(redoStack)
        .build());
  }

  @Override
  public SketchmonState createInitialState(SketchmonConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var pool = pool(config, context);
    if (pool.isEmpty()) throw new EngineException("No hay Pokémon disponibles para esa configuración.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, SketchmonPlayerStats>();
    for (var id : playerIds) scores.put(id, 0);
    for (var id : playerIds) playerStats.put(id, SketchmonPlayerStats.ZERO);
    return SketchmonState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .drawerOrder(drawerOrder(playerIds, config.laps(), context))
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public SketchmonState start(SketchmonState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginNextRound(state, context);
  }

  @Override
  public GameActionResult<SketchmonState> handleAction(SketchmonState initial, String playerId,
      SketchmonAction action, GameContext context) {
    if (initial.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(initial, "No hay una ronda activa.");
    if (!initial.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(initial, "Estás observando esta ronda.");
    }
    if (Timing.deadlinePassedOrMissing(context.now(), initial.roundEndsAt())) {
      // Rechazo que también resuelve la ronda, como el { state: resolveRound(...), accepted: false } de TS.
      return GameActionResult.reject(resolveRound(initial, context, null), "El tiempo ha terminado.");
    }
    // A partir de aquí, también los rechazos devuelven el estado con las pistas al día.
    var state = advanceHints(initial, context);
    boolean isDrawer = playerId.equals(state.drawerId());
    return switch (action) {
      case SketchmonAction.DrawBatch batch -> isDrawer
          ? applyDrawingBatch(state, batch)
          : GameActionResult.reject(state, "Solo quien dibuja puede añadir trazos.");
      case SketchmonAction.UndoStroke undo -> isDrawer ? undo(state)
          : GameActionResult.reject(state, "Solo quien dibuja puede editar el lienzo.");
      case SketchmonAction.RedoStroke redo -> isDrawer ? redo(state)
          : GameActionResult.reject(state, "Solo quien dibuja puede editar el lienzo.");
      case SketchmonAction.ClearDrawing clear -> isDrawer ? clear(state)
          : GameActionResult.reject(state, "Solo quien dibuja puede editar el lienzo.");
      case SketchmonAction.GuessPokemon guess -> isDrawer
          ? GameActionResult.reject(state, "Quien dibuja no puede adivinar.")
          : guess(state, playerId, guess.pokemonId(), context);
    };
  }

  /** {@code CLEAR_DRAWING}: con el lienzo vacío se acepta sin cambios. */
  private static GameActionResult<SketchmonState> clear(SketchmonState state) {
    if (state.strokes().isEmpty()) return GameActionResult.accept(state);
    return GameActionResult.accept(state.toBuilder().strokes(List.of()).undoStack(push(state.undoStack(),
        state.strokes())).redoStack(List.of()).build());
  }

  /** {@code UNDO_STROKE}: con la pila vacía se acepta sin cambios. */
  private static GameActionResult<SketchmonState> undo(SketchmonState state) {
    if (state.undoStack().isEmpty()) return GameActionResult.accept(state);
    var previous = state.undoStack().getLast();
    return GameActionResult.accept(state.toBuilder()
        .strokes(previous)
        .undoStack(state.undoStack().subList(0, state.undoStack().size() - 1))
        .redoStack(push(state.redoStack(), state.strokes()))
        .build());
  }

  /** {@code REDO_STROKE}: con la pila vacía se acepta sin cambios. */
  private static GameActionResult<SketchmonState> redo(SketchmonState state) {
    if (state.redoStack().isEmpty()) return GameActionResult.accept(state);
    var next = state.redoStack().getLast();
    return GameActionResult.accept(state.toBuilder()
        .strokes(next)
        .undoStack(push(state.undoStack(), state.strokes()))
        .redoStack(state.redoStack().subList(0, state.redoStack().size() - 1))
        .build());
  }

  /** {@code GUESS_POKEMON} de quien no dibuja: un fallo añade el intento y el enfriamiento. */
  private static GameActionResult<SketchmonState> guess(SketchmonState state, String playerId, String pokemonId,
      GameContext context) {
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var found = context.pokemon().byId(pokemonId);
    if (found.isEmpty() || !state.poolIds().contains(found.get().id())) {
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
    }
    var guessed = found.get();
    int attemptCount = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var stats = state.playerStats().getOrDefault(playerId, SketchmonPlayerStats.ZERO);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attemptCount);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats.afterAttempt());
    var next = state.toBuilder().attemptCounts(attemptCounts).playerStats(playerStats).build();
    if (guessed.id().equals(state.targetPokemonId())) {
      return GameActionResult.accept(resolveRound(next, context, playerId));
    }
    var attempts = new ArrayList<>(next.attempts());
    attempts.add(new SketchmonAttempt(playerId, SketchmonGuessedPokemon.of(guessed), context.now()));
    return GameActionResult.accept(next.toBuilder()
        .attempts(attempts)
        .cooldownUntil(Timing.setPlayerCooldown(next.cooldownUntil(), playerId, context.now(), GUESS_COOLDOWN_MS))
        .build());
  }

  /** {@code handleTimeout} propio de TS (no usa {@code advanceTimedRound}): se porta literal. */
  @Override
  public SketchmonState handleTimeout(SketchmonState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return resolveRound(state, context, null);
    }
    if (state.phase() == GamePhase.ROUND_ACTIVE) return advanceHints(state, context);
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginNextRound(state, context);
    }
    return state;
  }

  /** Si quien dibuja se desconecta, su ronda cuenta como fallo y empieza la siguiente. */
  @Override
  public SketchmonState handlePresenceChange(SketchmonState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.drawerId() == null
        || context.isPlayerRequired(state.drawerId())) {
      return state;
    }
    var canceled = incrementDrawingFailure(state, state.drawerId());
    return beginNextRound(canceled.toBuilder()
        .targetPokemonId(null)
        .drawerId(null)
        .strokes(List.of())
        .undoStack(List.of())
        .redoStack(List.of())
        .visibleHints(List.of())
        .attempts(List.of())
        .roundStartedAt(null)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .lastRound(null)
        .build(), context);
  }

  @Override
  public SketchmonPublicState getPublicState(SketchmonState state, GameContext context) {
    int playerCount = state.playerIds().size();
    int totalRounds = state.drawerOrder().size();
    int lapNumber = Math.min(state.config().laps(),
        Math.floorDiv(Math.max(0, state.roundNumber() - 1), playerCount) + 1);
    int lapStart = Math.max(0, lapNumber - 1) * playerCount;
    var nextDrawerId = state.drawerOrder().subList(Math.min(state.roundNumber(), totalRounds), totalRounds).stream()
        .filter(context::isPlayerRequired)
        .findFirst()
        .orElse(null);
    boolean roundResults = state.phase() == GamePhase.ROUND_RESULTS;
    boolean gameResults = state.phase() == GamePhase.GAME_RESULTS;
    return SketchmonPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .roundNumber(state.roundNumber())
        .totalRounds(totalRounds)
        .lapNumber(lapNumber)
        .totalLaps(state.config().laps())
        .drawerId(state.drawerId())
        .nextDrawerId(nextDrawerId)
        .drawerOrder(state.drawerOrder().subList(Math.min(lapStart, totalRounds),
            Math.min(lapStart + playerCount, totalRounds)))
        .strokes(state.strokes())
        .visibleHints(state.visibleHints())
        .attempts(GuessingRound.publicAttempts(state.config().publicAttempts(), state.attempts()))
        .scores(state.scores())
        .roundStartedAt(state.roundStartedAt())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .lastRound(roundResults ? state.lastRound() : null)
        .gallery(gameResults ? state.gallery() : List.of())
        .results(gameResults ? SketchmonRules.buildSketchmonResults(state) : null)
        .build();
  }

  @Override
  public SketchmonPlayerState getPlayerState(SketchmonState state, String playerId, GameContext context) {
    boolean participating = state.playerIds().contains(playerId) && context.isPlayerRequired(playerId);
    if (!participating) return new SketchmonPlayerState.Spectator();
    if (state.phase() == GamePhase.ROUND_ACTIVE && playerId.equals(state.drawerId())) {
      var target = target(state, context);
      Long previewEndsAt = state.config().memoryPreviewEnabled() && state.roundStartedAt() != null
          ? state.roundStartedAt() + SPRITE_PREVIEW_MS
          : null;
      boolean previewVisible = previewEndsAt == null || context.now() < previewEndsAt;
      return new SketchmonPlayerState.Drawer(target.isPresent(), target.map(pokemon -> new SketchmonDrawerPokemon(
          pokemon.name(),
          previewVisible ? pokemon.sprite() : null,
          previewEndsAt,
          state.config().memoryPreviewEnabled() ? List.of() : pokemon.types())).orElse(null),
          GuessingRound.guideAttempts(state.config().publicAttempts(), state.attempts()));
    }
    return new SketchmonPlayerState.Guesser(
        state.phase() == GamePhase.ROUND_ACTIVE && !playerId.equals(state.drawerId()),
        state.cooldownUntil().get(playerId),
        state.attemptCounts().getOrDefault(playerId, 0),
        GuessingRound.ownAttempts(state.config().publicAttempts(), state.attempts(),
            SketchmonAttempt::playerId, playerId));
  }

  @Override
  public GameLifecycle getLifecycle(SketchmonState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(SketchmonState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(SketchmonState state) {
    return SketchmonRules.buildSketchmonResults(state);
  }
}
