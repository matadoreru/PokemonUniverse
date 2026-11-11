package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.PuzzleOptions;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.ConnectionAnswerGroup;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.ConnectionAttemptFeedback;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PlayerProgressView;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsAction;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsProgress;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsPublicState;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsRoundResult;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsState;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsStats;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.RoundPlayerResult;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Traducción literal de {@code pokemon-connections/server.ts}. */
public final class PokemonConnectionsEngine implements GameEngine<PokemonConnectionsConfig, PokemonConnectionsState,
    PokemonConnectionsAction, PokemonConnectionsPublicState> {

  public static final String ID = "pokemon-connections";
  static final long POKEMON_CONNECTIONS_REVEAL_MS = 30_000;
  /** Recortes de {@code usedPuzzleKeys.slice(-50)} y {@code recentCategoryIds.slice(-12)}. */
  private static final int USED_PUZZLE_KEYS_LIMIT = 50;
  private static final int RECENT_CATEGORY_IDS_LIMIT = 12;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonConnectionsEngine(GameManifest manifest) {
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
  public PokemonConnectionsConfig parseConfig(JsonNode raw) {
    return PokemonConnectionsConfig.parse(raw);
  }

  @Override
  public PokemonConnectionsAction parseAction(JsonNode raw) {
    return PokemonConnectionsAction.parse(raw);
  }

  @Override
  public PokemonConnectionsConfig defaultConfig() {
    return PokemonConnectionsConfig.defaults();
  }

  private static <T> List<T> appended(List<T> values, T value) {
    var next = new ArrayList<T>(values);
    next.add(value);
    return next;
  }

  /** {@code values.length > limit ? values.slice(-limit) : values}. */
  private static <T> List<T> lastAtMost(List<T> values, int limit) {
    return values.size() > limit ? values.subList(values.size() - limit, values.size()) : values;
  }

  private static Map<String, PokemonConnectionsProgress> createProgress(List<String> playerIds) {
    var progress = new LinkedHashMap<String, PokemonConnectionsProgress>();
    for (var playerId : playerIds) progress.put(playerId, PokemonConnectionsProgress.EMPTY);
    return progress;
  }

  private static PokemonConnectionsStats stats(PokemonConnectionsState state, String playerId) {
    return Objects.requireNonNullElse(state.playerStats().get(playerId),
        PokemonConnectionsRules.emptyPokemonConnectionsStats());
  }

  /** {@code preparePuzzle}: genera el puzle y después baraja el tablero, en ese orden de {@code random}. */
  private static PokemonConnectionsState preparePuzzle(PokemonConnectionsState state, GameContext context) {
    var config = state.config();
    var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context, new PuzzleOptions(config.groupSize(),
        config.pokemonCount(), config.generations(), state.usedPuzzleKeys(), state.recentCategoryIds()));
    var usedPuzzleKeys = appended(state.usedPuzzleKeys(), puzzle.key());
    var recentCategoryIds = new ArrayList<String>(state.recentCategoryIds());
    for (var group : puzzle.groups()) recentCategoryIds.add(group.categoryId());
    return state.toBuilder()
        .board(PokemonConnectionsCatalog.shuffledConnectionsBoard(puzzle.groups(), context.random()))
        .answerGroups(puzzle.groups())
        .puzzleSource(puzzle.source())
        .puzzleKey(puzzle.key())
        .usedPuzzleKeys(lastAtMost(usedPuzzleKeys, USED_PUZZLE_KEYS_LIMIT))
        .recentCategoryIds(lastAtMost(recentCategoryIds, RECENT_CATEGORY_IDS_LIMIT))
        .build();
  }

  private static PokemonConnectionsState activatePreparedRound(PokemonConnectionsState state, GameContext context) {
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .progress(createProgress(state.playerIds()))
        .completionOrder(List.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static PokemonConnectionsState beginNextRound(PokemonConnectionsState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    return activatePreparedRound(preparePuzzle(state, context), context);
  }

  private static Set<String> groupIds(ConnectionAnswerGroup group) {
    var ids = new HashSet<String>();
    for (var pokemon : group.pokemon()) ids.add(pokemon.id());
    return ids;
  }

  private static @Nullable ConnectionAnswerGroup exactGroup(List<ConnectionAnswerGroup> groups, Set<String> selected) {
    for (var group : groups) {
      var ids = groupIds(group);
      if (ids.size() == selected.size() && ids.containsAll(selected)) return group;
    }
    return null;
  }

  private static boolean isNearMiss(List<ConnectionAnswerGroup> groups, Set<String> selected) {
    return groups.stream().anyMatch(group ->
        group.pokemon().stream().filter(pokemon -> selected.contains(pokemon.id())).count() == selected.size() - 1);
  }

  /** {@code progress[playerId]?.status !== 'PLAYING'}: sin progreso también cuenta como terminado. */
  private static boolean allRequiredDone(PokemonConnectionsState state, GameContext context) {
    return context.allConnectedRequiredCompleted(state.playerIds(), playerId -> {
      var progress = state.progress().get(playerId);
      return progress == null || !PokemonConnectionsTypes.PLAYING.equals(progress.status());
    });
  }

  /** {@code completedAt - roundStartedAt}, o nulo si falta alguno. */
  private static @Nullable Long elapsedMs(PokemonConnectionsState state, PokemonConnectionsProgress player) {
    return player.completedAt() == null || state.roundStartedAt() == null ? null
        : Long.valueOf(player.completedAt() - state.roundStartedAt());
  }

  private static PokemonConnectionsState finishRound(PokemonConnectionsState state, GameContext context) {
    var progress = new LinkedHashMap<String, PokemonConnectionsProgress>();
    for (var playerId : state.playerIds()) {
      var current = Objects.requireNonNullElse(state.progress().get(playerId), PokemonConnectionsProgress.EMPTY);
      progress.put(playerId, PokemonConnectionsTypes.PLAYING.equals(current.status())
          ? current.toBuilder().status(PokemonConnectionsTypes.TIMED_OUT).build() : current);
    }
    var playerStats = new LinkedHashMap<String, PokemonConnectionsStats>();
    for (var playerId : state.playerIds()) {
      var player = progress.get(playerId);
      var elapsed = elapsedMs(state, player);
      // (completionRank ?? Infinity) <= 3.
      boolean podium = player.completionRank() != null && player.completionRank() <= 3;
      playerStats.put(playerId, stats(state, playerId).afterRound(
          PokemonConnectionsTypes.SOLVED.equals(player.status()), podium, elapsed == null ? 0 : elapsed));
    }
    var players = new LinkedHashMap<String, RoundPlayerResult>();
    for (var playerId : state.playerIds()) {
      var player = progress.get(playerId);
      players.put(playerId, RoundPlayerResult.of(player, elapsedMs(state, player)));
    }
    var lastRound = new PokemonConnectionsRoundResult(state.puzzleSource(), state.answerGroups(), players);
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .progress(progress)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + POKEMON_CONNECTIONS_REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static PokemonConnectionsState settle(PokemonConnectionsState next, GameContext context) {
    return allRequiredDone(next, context) ? finishRound(next, context) : next;
  }

  /** Prepara el primer puzle; {@code start} solo lo activa. */
  @Override
  public PokemonConnectionsState createInitialState(PokemonConnectionsConfig config, GameContext context) {
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, PokemonConnectionsStats>();
    for (var playerId : playerIds) {
      scores.put(playerId, 0);
      playerStats.put(playerId, PokemonConnectionsRules.emptyPokemonConnectionsStats());
    }
    var base = PokemonConnectionsState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .roundNumber(0)
        .board(List.of())
        .answerGroups(List.of())
        .puzzleSource("DYNAMIC")
        .puzzleKey("")
        .usedPuzzleKeys(List.of())
        .recentCategoryIds(List.of())
        .progress(createProgress(playerIds))
        .completionOrder(List.of())
        .scores(scores)
        .playerStats(playerStats)
        .roundStartedAt(null)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
    return preparePuzzle(base, context);
  }

  @Override
  public PokemonConnectionsState start(PokemonConnectionsState state, GameContext context) {
    return activatePreparedRound(state, context);
  }

  @Override
  public GameActionResult<PokemonConnectionsState> handleAction(PokemonConnectionsState state, String playerId,
      PokemonConnectionsAction action, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
    }
    if (action instanceof PokemonConnectionsAction.AdvanceRound) {
      if (state.phase() != GamePhase.ROUND_RESULTS) {
        return GameActionResult.reject(state, "La solución aún no se está mostrando.");
      }
      if (context.hostId() == null || context.hostId().isEmpty() || !context.hostId().equals(playerId)) {
        return GameActionResult.reject(state, "Solo el Host puede avanzar el puzle.");
      }
      return GameActionResult.accept(beginNextRound(state, context));
    }
    var submit = (PokemonConnectionsAction.SubmitGroup) action;
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La ronda no está activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta ronda.");
    }
    var current = state.progress().get(playerId);
    if (current == null || !PokemonConnectionsTypes.PLAYING.equals(current.status())) {
      return GameActionResult.reject(state, "Ya no puedes enviar más grupos en esta ronda.");
    }
    int groupSize = state.config().groupSize();
    // new Set(action.pokemonIds): orden de primera aparición.
    var uniqueIds = new LinkedHashSet<>(submit.pokemonIds());
    if (uniqueIds.size() != groupSize || submit.pokemonIds().size() != groupSize) {
      return GameActionResult.reject(state, "Selecciona exactamente " + groupSize + " Pokémon distintos.");
    }
    var boardIds = new HashSet<String>();
    for (var pokemon : state.board()) boardIds.add(pokemon.id());
    if (!boardIds.containsAll(uniqueIds)) {
      return GameActionResult.reject(state, "La selección contiene un Pokémon ajeno al tablero.");
    }
    var foundIds = new HashSet<String>();
    for (var groupId : current.foundGroupIds()) {
      state.answerGroups().stream().filter(group -> group.id().equals(groupId)).findFirst()
          .ifPresent(group -> group.pokemon().forEach(pokemon -> foundIds.add(pokemon.id())));
    }
    if (uniqueIds.stream().anyMatch(foundIds::contains)) {
      return GameActionResult.reject(state, "Ese Pokémon ya pertenece a un grupo encontrado.");
    }
    var remainingGroups = state.answerGroups().stream()
        .filter(group -> !current.foundGroupIds().contains(group.id()))
        .toList();
    var attempted = List.copyOf(uniqueIds);
    var matched = exactGroup(remainingGroups, uniqueIds);
    if (matched != null) {
      var foundGroupIds = appended(current.foundGroupIds(), matched.id());
      boolean solved = foundGroupIds.size() == state.answerGroups().size();
      Integer completionRank = solved ? Integer.valueOf(state.completionOrder().size() + 1) : null;
      int bonus = completionRank == null ? 0 : PokemonConnectionsRules.completionBonus(completionRank);
      var progressEntry = current.toBuilder()
          .foundGroupIds(foundGroupIds)
          .status(solved ? PokemonConnectionsTypes.SOLVED : PokemonConnectionsTypes.PLAYING)
          .completedAt(solved ? Long.valueOf(context.now()) : null)
          .completionRank(completionRank)
          .roundPoints(current.roundPoints() + 1 + bonus)
          .lastAttempt(ConnectionAttemptFeedback.correct(attempted, context.now()))
          .build();
      var progress = new LinkedHashMap<>(state.progress());
      progress.put(playerId, progressEntry);
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, Objects.requireNonNullElse(state.scores().get(playerId), 0) + 1 + bonus);
      var playerStats = new LinkedHashMap<>(state.playerStats());
      playerStats.put(playerId, stats(state, playerId).afterGroupFound());
      var next = state.toBuilder()
          .progress(progress)
          .completionOrder(solved ? appended(state.completionOrder(), playerId) : state.completionOrder())
          .scores(scores)
          .playerStats(playerStats)
          .build();
      return GameActionResult.accept(settle(next, context));
    }
    boolean nearMiss = isNearMiss(remainingGroups, uniqueIds);
    int mistakesUsed = current.mistakesUsed() + 1;
    var progressEntry = current.toBuilder()
        .mistakesUsed(mistakesUsed)
        .status(mistakesUsed >= state.config().mistakesAllowed()
            ? PokemonConnectionsTypes.ELIMINATED : PokemonConnectionsTypes.PLAYING)
        .lastAttempt(ConnectionAttemptFeedback.incorrect(attempted, nearMiss, context.now()))
        .build();
    var progress = new LinkedHashMap<>(state.progress());
    progress.put(playerId, progressEntry);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats(state, playerId).afterMistake(nearMiss));
    var next = state.toBuilder().progress(progress).playerStats(playerStats).build();
    return GameActionResult.accept(settle(next, context));
  }

  @Override
  public PokemonConnectionsState handleTimeout(PokemonConnectionsState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return finishRound(state, context);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginNextRound(state, context);
    }
    return state;
  }

  @Override
  public PokemonConnectionsState handlePresenceChange(PokemonConnectionsState state, GameContext context) {
    return state.phase() == GamePhase.ROUND_ACTIVE && allRequiredDone(state, context)
        ? finishRound(state, context) : state;
  }

  @Override
  public PokemonConnectionsPublicState getPublicState(PokemonConnectionsState state, GameContext context) {
    var playerProgress = new LinkedHashMap<String, PlayerProgressView>();
    for (var playerId : state.playerIds()) {
      var progress = Objects.requireNonNullElse(state.progress().get(playerId), PokemonConnectionsProgress.EMPTY);
      playerProgress.put(playerId, new PlayerProgressView(progress.foundGroupIds().size(), progress.status()));
    }
    boolean revealed = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    return PokemonConnectionsPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .roundNumber(state.roundNumber())
        .totalRounds(state.config().rounds())
        .groupSize(state.config().groupSize())
        .groupCount(state.answerGroups().size())
        .board(state.board())
        .playerProgress(playerProgress)
        .scores(state.scores())
        .roundStartedAt(state.roundStartedAt())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .lastRound(revealed ? state.lastRound() : null)
        .results(state.phase() == GamePhase.GAME_RESULTS
            ? PokemonConnectionsRules.buildPokemonConnectionsResults(state) : null)
        .build();
  }

  /** Sin progreso en la ronda o fuera de {@code playerIds} se es espectador; un desconectado sigue siendo jugador. */
  @Override
  public PokemonConnectionsPlayerState getPlayerState(PokemonConnectionsState state, String playerId,
      GameContext context) {
    var progress = state.progress().get(playerId);
    if (progress == null || !state.playerIds().contains(playerId)) {
      return PokemonConnectionsPlayerState.Spectator.INSTANCE;
    }
    var found = new HashSet<>(progress.foundGroupIds());
    return PokemonConnectionsPlayerState.Player.builder()
        .canSubmit(state.phase() == GamePhase.ROUND_ACTIVE && PokemonConnectionsTypes.PLAYING.equals(progress.status()))
        .foundGroups(state.answerGroups().stream().filter(group -> found.contains(group.id())).toList())
        .mistakesUsed(progress.mistakesUsed())
        .mistakesAllowed(state.config().mistakesAllowed())
        .status(progress.status())
        .completionRank(progress.completionRank())
        .roundPoints(progress.roundPoints())
        .lastAttempt(progress.lastAttempt())
        .build();
  }

  @Override
  public GameLifecycle getLifecycle(PokemonConnectionsState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokemonConnectionsState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonConnectionsState state) {
    return PokemonConnectionsRules.buildPokemonConnectionsResults(state);
  }
}
