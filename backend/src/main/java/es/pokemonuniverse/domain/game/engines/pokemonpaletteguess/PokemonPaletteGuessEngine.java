package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessAttemptOutcome;
import es.pokemonuniverse.domain.game.engine.infra.GuessLastAttempt;
import es.pokemonuniverse.domain.game.engine.infra.GuessPlayerStats;
import es.pokemonuniverse.domain.game.engine.infra.GuessPokemonSummary;
import es.pokemonuniverse.domain.game.engine.infra.GuessingRound;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.SpeedPodiumScore;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessConfig.PokemonPaletteHintKind;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteAttempt;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessAction;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessPublicState;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessState;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteHint;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPalettePublicRoundResult;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteRole;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteRoundResult;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteSolve;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteSolvedPlayer;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteTarget;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal del TS que antes estaba en {@code pokemon-palette-guess/server.ts}. */
public final class PokemonPaletteGuessEngine implements
    GameEngine<PokemonPaletteGuessConfig, PokemonPaletteGuessState, PokemonPaletteGuessAction,
        PokemonPaletteGuessPublicState> {

  public static final String ID = "pokemon-palette-guess";
  public static final long COOLDOWN_MS = 1_000;
  public static final long REVEAL_MS = 4_000;
  private static final int MIN_PALETTE_COLORS = 3;

  private final GameManifest manifest;

  private static final TimedRoundStrategy<PokemonPaletteGuessState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public PokemonPaletteGuessState beginNext(PokemonPaletteGuessState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public PokemonPaletteGuessState resolveActive(PokemonPaletteGuessState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public PokemonPaletteGuessState finish(PokemonPaletteGuessState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(PokemonPaletteGuessState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonPaletteGuessEngine(GameManifest manifest) {
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
  public PokemonPaletteGuessConfig parseConfig(JsonNode raw) {
    return PokemonPaletteGuessConfig.parse(raw);
  }

  @Override
  public PokemonPaletteGuessAction parseAction(JsonNode raw) {
    return PokemonPaletteGuessAction.parse(raw);
  }

  @Override
  public PokemonPaletteGuessConfig defaultConfig() {
    return PokemonPaletteGuessConfig.defaults();
  }

  /** Colores visibles y sus pesos normalizados. */
  record VisiblePalette(List<String> colors, List<Double> weights) {

    static final VisiblePalette EMPTY = new VisiblePalette(List.of(), List.of());
  }

  /**
   * {@code visiblePalette}: los {@code size} primeros colores; los pesos persistidos solo si tienen la misma longitud
   * que la paleta completa (si no, peso 1 por color), normalizados por su suma.
   */
  static VisiblePalette visiblePalette(Pokemon pokemon, int size) {
    var palette = pokemon.palette() == null ? List.<String>of() : pokemon.palette();
    var colors = palette.subList(0, Math.min(size, palette.size()));
    var persistedWeights = pokemon.paletteWeights();
    List<Double> source;
    if (persistedWeights != null && pokemon.palette() != null && persistedWeights.size() == pokemon.palette().size()) {
      source = persistedWeights.subList(0, Math.min(size, persistedWeights.size()));
    } else {
      source = colors.stream().map(color -> 1.0).toList();
    }
    double total = 0;
    for (var weight : source) total += weight;
    double sum = total;
    return new VisiblePalette(List.copyOf(colors), source.stream().map(weight -> weight / sum).toList());
  }

  /** {@code pokemonPalettePool}: formas por defecto con id, nombre, sprite y al menos 3 colores. */
  static List<Pokemon> pool(PokemonPaletteGuessConfig config, GameContext context) {
    return context.pokemon().forGenerations(config.generations()).stream()
        .filter(pokemon -> JsStrings.truthy(pokemon.id()) && JsStrings.truthy(pokemon.name())
            && JsStrings.truthy(pokemon.sprite())
            && (pokemon.palette() == null ? 0 : pokemon.palette().size()) >= MIN_PALETTE_COLORS)
        .toList();
  }

  /** {@code buildPokemonPaletteHints}: una pista por tipo pedido, si el Pokémon tiene el dato. */
  static List<PokemonPaletteHint> buildHints(Pokemon pokemon, List<PokemonPaletteHintKind> kinds) {
    var hints = new ArrayList<PokemonPaletteHint>();
    for (var kind : kinds) {
      switch (kind) {
        case GENERATION -> hints.add(new PokemonPaletteHint.Generation(pokemon.generation()));
        case TYPE -> hints.add(new PokemonPaletteHint.Type(pokemon.types()));
        case TYPE_COUNT -> hints.add(new PokemonPaletteHint.TypeCount(pokemon.types().size()));
        case EVOLUTION -> {
          var stage = pokemon.evolutionStage();
          var stages = pokemon.evolutionStageCount();
          if (stage != null && stage != 0 && stages != null && stages != 0) {
            hints.add(new PokemonPaletteHint.Evolution(stage, stages));
          }
        }
        case CATEGORY -> {
          if (JsStrings.truthy(pokemon.legendaryStatus())) hints.add(new PokemonPaletteHint.Category(pokemon.legendaryStatus()));
        }
      }
    }
    return hints;
  }

  /** Consume {@code random} una vez (objetivo); si ya se usaron todos, vuelve a elegir entre todo el pool. */
  private static PokemonPaletteGuessState beginRound(PokemonPaletteGuessState state, GameContext context) {
    var pool = new ArrayList<Pokemon>();
    for (var id : state.poolIds()) context.pokemon().byId(id).ifPresent(pool::add);
    var candidates = Randoms.preferUnused(pool, pokemon -> state.usedPokemonIds().contains(pokemon.id()));
    if (candidates.isEmpty()) throw new EngineException("No hay paletas persistidas para esta configuración.");
    var target = Randoms.randomItem(candidates, context.random());
    var used = new LinkedHashSet<>(state.usedPokemonIds());
    used.add(target.id());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .targetPokemonId(target.id())
        .usedPokemonIds(new ArrayList<>(used))
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

  private static PokemonPaletteGuessState resolveRound(PokemonPaletteGuessState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var target = context.pokemon().byId(state.targetPokemonId() == null ? "" : state.targetPokemonId())
        .filter(pokemon -> pokemon.palette() != null)
        .orElseThrow(() -> new EngineException("La paleta objetivo ya no está disponible."));
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : state.playerIds()) {
      if (!state.solves().containsKey(playerId)) {
        playerStats.put(playerId, playerStats.getOrDefault(playerId, GuessPlayerStats.ZERO).afterMiss());
      }
    }
    var palette = visiblePalette(target, state.config().paletteSize());
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(new PokemonPaletteRoundResult(
            new PokemonPaletteTarget(target.id(), target.name(), target.sprite(), target.generation()),
            palette.colors(), palette.weights(), new LinkedHashMap<>(state.solves()),
            new LinkedHashMap<>(state.attemptCounts())))
        .build();
  }

  private static PokemonPaletteGuessState resolveIfComplete(PokemonPaletteGuessState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), PokemonPaletteGuessEngine::resolveRound);
  }

  @Override
  public PokemonPaletteGuessState createInitialState(PokemonPaletteGuessConfig config, GameContext context) {
    var pool = pool(config, context);
    if (pool.isEmpty()) {
      throw new EngineException("No hay suficientes paletas en PostgreSQL para las generaciones y tamaño seleccionados. "
          + "Ejecuta la sincronización Pokémon.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, GuessPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, GuessPlayerStats.ZERO);
    }
    return PokemonPaletteGuessState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public PokemonPaletteGuessState start(PokemonPaletteGuessState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  /** Un intento tardío se rechaza pero resuelve la ronda ({@code state: resolveRound(state, context)} en TS). */
  @Override
  public GameActionResult<PokemonPaletteGuessState> handleAction(PokemonPaletteGuessState state, String playerId,
      PokemonPaletteGuessAction action, GameContext context) {
    var rejected = GuessingRound.precheck(state, playerId, context, "Ya has acertado esta ronda.",
        expired -> resolveRound(expired, context));
    if (rejected != null) return rejected;
    var found = context.pokemon().byId(action.pokemonId());
    if (found.isEmpty() || !state.poolIds().contains(found.get().id())) {
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
    }
    var guessed = found.get();
    int attempts = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var stats = state.playerStats().getOrDefault(playerId, GuessPlayerStats.ZERO);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attempts);
    var lastAttemptResult = new LinkedHashMap<>(state.lastAttemptResult());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    if (guessed.id().equals(state.targetPokemonId())) {
      int solveOrder = state.solves().size() + 1;
      long roundStartedAt = Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
      long elapsedMs = context.now() - roundStartedAt;
      var score = SpeedPodiumScore.of(roundStartedAt, state.config().roundSeconds(),
          context.now(), solveOrder);
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId, PokemonPaletteSolve.of(solveOrder, context.now(), elapsedMs, score, attempts));
      lastAttemptResult.put(playerId, new GuessLastAttempt(GuessAttemptOutcome.CORRECT, context.now()));
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
    var attemptList = new ArrayList<>(state.attempts());
    attemptList.add(new PokemonPaletteAttempt(playerId, GuessPokemonSummary.of(guessed), context.now()));
    lastAttemptResult.put(playerId, new GuessLastAttempt(GuessAttemptOutcome.INCORRECT, context.now()));
    playerStats.put(playerId, stats.afterWrongAttempt());
    return GameActionResult.accept(state.toBuilder()
        .attempts(attemptList)
        .attemptCounts(attemptCounts)
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(), COOLDOWN_MS))
        .lastAttemptResult(lastAttemptResult)
        .playerStats(playerStats)
        .build());
  }

  @Override
  public PokemonPaletteGuessState handleTimeout(PokemonPaletteGuessState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public PokemonPaletteGuessState handlePresenceChange(PokemonPaletteGuessState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public PokemonPaletteGuessPublicState getPublicState(PokemonPaletteGuessState state, GameContext context) {
    var target = context.pokemon().byId(state.targetPokemonId() == null ? "" : state.targetPokemonId());
    boolean reveal = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE;
    var palette = target.map(pokemon -> visiblePalette(pokemon, state.config().paletteSize()))
        .orElse(VisiblePalette.EMPTY);
    var lastRound = state.lastRound();
    var solvedPlayers = state.solves().entrySet().stream()
        .map(entry -> new PokemonPaletteSolvedPlayer(entry.getKey(), entry.getValue().solveOrder()))
        .sorted(Comparator.comparingInt(PokemonPaletteSolvedPlayer::solveOrder))
        .toList();
    return new PokemonPaletteGuessPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        active ? palette.colors() : lastRound != null ? lastRound.palette() : List.of(),
        active ? palette.weights() : lastRound != null ? lastRound.paletteWeights() : List.of(),
        active && state.config().hintsEnabled() && target.isPresent()
            ? buildHints(target.get(), state.config().hintKinds()) : List.of(),
        GuessingRound.publicAttempts(state.config().publicAttempts(), state.attempts()),
        solvedPlayers, state.scores(), state.roundStartedAt(), state.roundEndsAt(),
        state.nextTransitionAt(),
        lastRound != null && reveal ? PokemonPalettePublicRoundResult.of(lastRound) : null,
        state.phase() == GamePhase.GAME_RESULTS ? PokemonPaletteGuessRules.buildPokemonPaletteResults(state) : null);
  }

  @Override
  public PokemonPaletteGuessPlayerState getPlayerState(PokemonPaletteGuessState state, String playerId,
      GameContext context) {
    var solve = state.solves().get(playerId);
    boolean participant = state.playerIds().contains(playerId);
    return new PokemonPaletteGuessPlayerState(participant ? PokemonPaletteRole.PLAYER : PokemonPaletteRole.SPECTATOR,
        state.phase() == GamePhase.ROUND_ACTIVE && participant && context.isPlayerRequired(playerId) && solve == null,
        solve != null,
        solve == null ? null : solve.solveOrder(),
        state.cooldownUntil().get(playerId),
        solve == null ? 0 : solve.points(),
        state.attemptCounts().getOrDefault(playerId, 0),
        state.lastAttemptResult().get(playerId),
        GuessingRound.ownAttempts(state.config().publicAttempts(), state.attempts(),
            PokemonPaletteAttempt::playerId, playerId));
  }

  @Override
  public GameLifecycle getLifecycle(PokemonPaletteGuessState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokemonPaletteGuessState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonPaletteGuessState state) {
    return PokemonPaletteGuessRules.buildPokemonPaletteResults(state);
  }
}
