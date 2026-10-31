package es.pokemonuniverse.domain.game.engines.guessfromstats;

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
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsAction;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsAttempt;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsAttemptOutcome;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsLastAttempt;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPlayerState;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPlayerStats;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPokemonReveal;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPokemonSummary;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPreparedRound;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPublicSolve;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPublicState;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsRoundResult;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsSolve;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsSolvedPlayer;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code guess-from-stats/server.ts}. */
public final class GuessFromStatsEngine
    implements GameEngine<GuessFromStatsConfig, GuessFromStatsState, GuessFromStatsAction, GuessFromStatsPublicState> {

  public static final String ID = "guess-from-stats";
  public static final long COOLDOWN_MS = 1_000;
  public static final long REVEAL_MS = 4_000;
  public static final int MAX_RECENT_ATTEMPTS = 48;

  private final GameManifest manifest;

  private static final TimedRoundStrategy<GuessFromStatsState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public GuessFromStatsState beginNext(GuessFromStatsState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public GuessFromStatsState resolveActive(GuessFromStatsState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public GuessFromStatsState finish(GuessFromStatsState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(GuessFromStatsState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public GuessFromStatsEngine(GameManifest manifest) {
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
  public GuessFromStatsConfig parseConfig(JsonNode raw) {
    return GuessFromStatsConfig.parse(raw);
  }

  @Override
  public GuessFromStatsAction parseAction(JsonNode raw) {
    return GuessFromStatsAction.parse(raw);
  }

  @Override
  public GuessFromStatsConfig defaultConfig() {
    return GuessFromStatsConfig.defaults();
  }

  /** {@code validBaseStats}: los enteros Java son siempre finitos; basta con que no sean negativos. */
  private static boolean validBaseStats(Pokemon pokemon) {
    return pokemon.hp() >= 0 && pokemon.attack() >= 0 && pokemon.defense() >= 0 && pokemon.specialAttack() >= 0
        && pokemon.specialDefense() >= 0 && pokemon.speed() >= 0;
  }

  /** {@code guessFromStatsPool}: con formas regionales. */
  static List<Pokemon> pool(GuessFromStatsConfig config, GameContext context) {
    return context.pokemon().forGenerations(config.generations(), true).stream()
        .filter(pokemon -> validBaseStats(pokemon) && GuessFromStatsRules.hasHintData(pokemon, config))
        .toList();
  }

  /**
   * {@code prepareGuessFromStatsRoundDeck}: barajados completos del pool hasta llenar las rondas. Cada pasada consume
   * {@code random} {@code pool.size() - 1} veces; {@code preloadImage} solo si el contexto lo trae.
   */
  static List<GuessFromStatsPreparedRound> prepareRoundDeck(GuessFromStatsConfig config, GameContext context) {
    var allowed = pool(config, context);
    if (allowed.size() < 2) {
      throw new EngineException("No hay suficientes Pokémon con estadísticas válidas para esta configuración.");
    }
    var bySignature = new LinkedHashMap<String, List<String>>();
    for (var pokemon : allowed) {
      bySignature.computeIfAbsent(GuessFromStatsRules.buildSignature(pokemon, config), key -> new ArrayList<>())
          .add(pokemon.id());
    }
    var deck = new ArrayList<GuessFromStatsPreparedRound>();
    while (deck.size() < config.rounds()) {
      for (var source : Randoms.shuffled(allowed, context.random())) {
        var signature = GuessFromStatsRules.buildSignature(source, config);
        var acceptedPokemonIds = bySignature.getOrDefault(signature, List.of());
        if (acceptedPokemonIds.isEmpty()) continue;
        deck.add(new GuessFromStatsPreparedRound(source.id(), signature, acceptedPokemonIds,
            GuessFromStatsRules.buildVisibleStats(source, config), GuessFromStatsRules.buildHints(source, config)));
        if (context.preloadImage() != null) context.preloadImage().accept(source.sprite());
        if (deck.size() >= config.rounds()) break;
      }
    }
    return deck;
  }

  private static @Nullable GuessFromStatsPreparedRound activeRound(GuessFromStatsState state) {
    int index = state.roundNumber() - 1;
    return index >= 0 && index < state.roundDeck().size() ? state.roundDeck().get(index) : null;
  }

  private static GuessFromStatsState beginRound(GuessFromStatsState state, GameContext context) {
    int roundNumber = state.roundNumber() + 1;
    if (roundNumber - 1 >= state.roundDeck().size()) {
      throw new EngineException("No se pudo preparar la siguiente ronda de estadísticas.");
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(roundNumber)
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

  /** {@code roundSolves}: los aciertos cuyo Pokémon sigue en el catálogo, en orden de inserción. */
  private static Map<String, GuessFromStatsPublicSolve> roundSolves(GuessFromStatsState state, GameContext context) {
    var result = new LinkedHashMap<String, GuessFromStatsPublicSolve>();
    state.solves().forEach((playerId, solve) -> context.pokemon().byId(solve.submittedPokemonId()).ifPresent(pokemon ->
        result.put(playerId, new GuessFromStatsPublicSolve(solve.solveOrder(), solve.solvedAt(), solve.elapsedMs(),
            solve.points(), solve.attempts(), GuessFromStatsPokemonSummary.of(pokemon)))));
    return result;
  }

  private static GuessFromStatsState resolveRound(GuessFromStatsState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var prepared = activeRound(state);
    if (prepared == null) throw new EngineException("La ronda ya no está disponible.");
    var answers = new ArrayList<GuessFromStatsPokemonReveal>();
    for (var id : prepared.acceptedPokemonIds()) {
      context.pokemon().byId(id).ifPresent(pokemon -> answers.add(GuessFromStatsPokemonReveal.of(pokemon)));
    }
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : state.playerIds()) {
      if (!state.solves().containsKey(playerId)) {
        playerStats.put(playerId, playerStats.getOrDefault(playerId, GuessFromStatsPlayerStats.ZERO).afterMiss());
      }
    }
    var lastRound = new GuessFromStatsRoundResult(answers, prepared.visibleStats(), prepared.hints(),
        roundSolves(state, context), new LinkedHashMap<>(state.attemptCounts()));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static GuessFromStatsState resolveIfComplete(GuessFromStatsState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), GuessFromStatsEngine::resolveRound);
  }

  @Override
  public GuessFromStatsState createInitialState(GuessFromStatsConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var pool = pool(config, context);
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, GuessFromStatsPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, GuessFromStatsPlayerStats.ZERO);
    }
    return GuessFromStatsState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .roundDeck(prepareRoundDeck(config, context))
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public GuessFromStatsState start(GuessFromStatsState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<GuessFromStatsState> handleAction(GuessFromStatsState state, String playerId,
      GuessFromStatsAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
    }
    if (state.solves().containsKey(playerId)) return GameActionResult.reject(state, "Ya has acertado esta ronda.");
    if (context.now() >= (state.roundEndsAt() == null ? 0 : state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
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
    var prepared = activeRound(state);
    if (prepared == null) return GameActionResult.reject(state, "La respuesta no está disponible.");
    int attemptCount = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var stats = state.playerStats().getOrDefault(playerId, GuessFromStatsPlayerStats.ZERO);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attemptCount);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    var lastAttemptResult = new LinkedHashMap<>(state.lastAttemptResult());
    if (prepared.acceptedPokemonIds().contains(guessed.id())) {
      int solveOrder = state.solves().size() + 1;
      int points = GuessFromStatsRules.roundPoints(state.playerIds().size(), solveOrder);
      long elapsedMs = context.now() - Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId, new GuessFromStatsSolve(solveOrder, context.now(), elapsedMs, points, attemptCount,
          guessed.id()));
      lastAttemptResult.put(playerId, new GuessFromStatsLastAttempt(GuessFromStatsAttemptOutcome.CORRECT, context.now()));
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + points);
      playerStats.put(playerId, GuessingRound.recordGuessSolve(stats, attemptCount, solveOrder, elapsedMs, points));
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
    attempts.add(new GuessFromStatsAttempt(playerId, GuessFromStatsPokemonSummary.of(guessed), context.now()));
    lastAttemptResult.put(playerId, new GuessFromStatsLastAttempt(GuessFromStatsAttemptOutcome.INCORRECT, context.now()));
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
  public GuessFromStatsState handleTimeout(GuessFromStatsState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public GuessFromStatsState handlePresenceChange(GuessFromStatsState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public GuessFromStatsPublicState getPublicState(GuessFromStatsState state, GameContext context) {
    var prepared = activeRound(state);
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE;
    var solvedPlayers = state.solves().entrySet().stream()
        .map(entry -> new GuessFromStatsSolvedPlayer(entry.getKey(), entry.getValue().solveOrder()))
        .sorted(Comparator.comparingInt(GuessFromStatsSolvedPlayer::solveOrder))
        .toList();
    boolean revealPhase = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    return new GuessFromStatsPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        active && prepared != null ? prepared.visibleStats() : List.of(),
        active && prepared != null ? prepared.hints() : List.of(),
        state.attempts(), solvedPlayers, state.scores(), state.roundStartedAt(), state.roundEndsAt(),
        state.nextTransitionAt(), revealPhase ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? GuessFromStatsRules.buildGuessFromStatsResults(state) : null);
  }

  @Override
  public GuessFromStatsPlayerState getPlayerState(GuessFromStatsState state, String playerId, GameContext context) {
    var solve = state.solves().get(playerId);
    return new GuessFromStatsPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId) && solve == null,
        solve != null,
        solve == null ? null : solve.solveOrder(),
        state.cooldownUntil().get(playerId),
        solve == null ? 0 : solve.points(),
        state.attemptCounts().getOrDefault(playerId, 0),
        state.lastAttemptResult().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(GuessFromStatsState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(GuessFromStatsState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(GuessFromStatsState state) {
    return GuessFromStatsRules.buildGuessFromStatsResults(state);
  }
}
