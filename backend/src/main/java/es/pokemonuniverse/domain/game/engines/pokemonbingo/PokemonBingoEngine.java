package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoBoardState;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoPokemonView;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoPrivateAttempt;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoPublicBoard;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoPublicCell;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.PokemonBingoAction;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.PokemonBingoPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.PokemonBingoPublicState;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.PokemonBingoState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionCell;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionRules;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

/** Traducción literal de {@code pokemon-bingo/server.ts}. */
public final class PokemonBingoEngine
    implements GameEngine<PokemonBingoConfig, PokemonBingoState, PokemonBingoAction, PokemonBingoPublicState> {

  public static final String ID = "pokemon-bingo";
  /** {@code BINGO_INCORRECT_COOLDOWN_MS}. */
  public static final long INCORRECT_COOLDOWN_MS = 1_000;
  /** {@code BINGO_REVEAL_MS}. */
  public static final long REVEAL_MS = 8_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonBingoEngine(GameManifest manifest) {
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
  public PokemonBingoConfig parseConfig(JsonNode raw) {
    return PokemonBingoConfig.parse(raw);
  }

  @Override
  public PokemonBingoAction parseAction(JsonNode raw) {
    return PokemonBingoAction.parse(raw);
  }

  @Override
  public PokemonBingoConfig defaultConfig() {
    return PokemonBingoConfig.defaults();
  }

  private static int completedCells(BingoBoardState board) {
    return board.assignments().size();
  }

  private static PokemonBingoState finish(PokemonBingoState state) {
    return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
  }

  private static Optional<ConditionCell> findCell(BingoBoardState board, String cellId) {
    return board.cells().stream().filter(cell -> cell.id().equals(cellId)).findFirst();
  }

  /** La primera casilla (en orden de asignación) que ya tiene ese Pokémon. */
  private static Optional<String> assignedCell(BingoBoardState board, String pokemonId) {
    return board.assignments().entrySet().stream()
        .filter(entry -> entry.getValue().equals(pokemonId))
        .map(Map.Entry::getKey)
        .findFirst();
  }

  private static <V> Map<String, V> with(Map<String, V> map, String key, V value) {
    var copy = new LinkedHashMap<>(map);
    copy.put(key, value);
    return copy;
  }

  private static PokemonBingoState privateAttempt(PokemonBingoState state, String playerId,
      BingoPrivateAttempt attempt, boolean cooldown) {
    var builder = state.toBuilder().lastAttempts(with(state.lastAttempts(), playerId, attempt));
    if (cooldown) {
      builder.cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, attempt.attemptedAt(),
          INCORRECT_COOLDOWN_MS));
    }
    return builder.build();
  }

  private static PokemonBingoState finishIfBingo(PokemonBingoState state, String playerId, GameContext context) {
    var board = state.boards().get(playerId);
    if (completedCells(board) != board.cells().size()) return state;
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .winnerId(playerId)
        .bingoAt(context.now())
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .build();
  }

  private static PokemonBingoState validAssignmentState(PokemonBingoState state, String playerId, BingoBoardState board,
      Pokemon pokemon, String cellId, GameContext context) {
    var priorStats = state.playerStats().get(playerId);
    var next = privateAttempt(state.toBuilder()
            .boards(with(state.boards(), playerId, board))
            .playerStats(with(state.playerStats(), playerId, priorStats.afterCorrect()))
            .cooldownUntil(with(state.cooldownUntil(), playerId, 0L))
            .build(),
        playerId,
        BingoPrivateAttempt.of(cellId, pokemon, context.now(), true, pokemon.name() + " colocado correctamente."),
        false);
    return finishIfBingo(next, playerId, context);
  }

  private static PokemonBingoState incorrectAttempt(PokemonBingoState state, String playerId,
      BingoPrivateAttempt attempt) {
    var priorStats = state.playerStats().get(playerId);
    return privateAttempt(
        state.toBuilder().playerStats(with(state.playerStats(), playerId, priorStats.afterIncorrect())).build(),
        playerId, attempt, true);
  }

  /** El ganador primero; después más casillas, progreso más antiguo y orden de jugadores. */
  private static List<String> bingoRanking(PokemonBingoState state) {
    var playerOrder = new HashMap<String, Integer>();
    for (int index = 0; index < state.playerIds().size(); index++) playerOrder.put(state.playerIds().get(index), index);
    var ordered = new ArrayList<>(state.playerIds());
    ordered.sort((left, right) -> {
      if (left.equals(state.winnerId())) return -1;
      if (right.equals(state.winnerId())) return 1;
      var a = state.boards().get(left);
      var b = state.boards().get(right);
      int result = completedCells(b) - completedCells(a);
      if (result == 0) result = Long.compare(a.lastProgressAt(), b.lastProgressAt());
      return result != 0 ? result : playerOrder.get(left) - playerOrder.get(right);
    });
    return ordered;
  }

  /** {@code buildPokemonBingoResults}. */
  public static GameResults buildPokemonBingoResults(PokemonBingoState state) {
    var ordered = bingoRanking(state);
    var standings = new ArrayList<GameStanding>();
    for (int index = 0; index < ordered.size(); index++) {
      var playerId = ordered.get(index);
      var board = state.boards().get(playerId);
      var playerStats = state.playerStats().get(playerId);
      boolean bingo = playerId.equals(state.winnerId());
      var stats = new LinkedHashMap<String, Number>();
      stats.put("games", 1);
      stats.put("bingos", bingo ? 1 : 0);
      stats.put("cellsCompleted", completedCells(board));
      stats.put("cellsTotal", board.cells().size());
      stats.put("correctAssignments", playerStats.correctAssignments());
      stats.put("incorrectAttempts", playerStats.incorrectAttempts());
      boolean bingoAtTruthy = state.bingoAt() != null && state.bingoAt() != 0;
      stats.put("bestBingoTimeMs", bingo && bingoAtTruthy ? state.bingoAt() - state.gameStartedAt() : 0);
      standings.add(new GameStanding(playerId, index + 1, Scoring.pointsForPosition(ordered.size(), index + 1), bingo,
          stats));
    }
    return new GameResults(state.winnerId(), standings);
  }

  private static BingoPublicBoard publicBoard(PokemonBingoState state, String playerId, GameContext context) {
    var board = state.boards().get(playerId);
    boolean revealSolutions = state.phase() == GamePhase.GAME_RESULTS;
    var cells = board.cells().stream().map(cell -> {
      var assigned = context.pokemon().byId(board.assignments().getOrDefault(cell.id(), ""));
      List<BingoPokemonView> possibleSolutions = revealSolutions && assigned.isEmpty()
          ? state.poolIds().stream()
              .map(id -> context.pokemon().byId(id)
                  .orElseThrow(() -> new EngineException("Pokémon desconocido: " + id)))
              .filter(pokemon -> ConditionRules.pokemonMatchesBingoCell(pokemon, cell))
              .limit(3)
              .map(BingoPokemonView::of)
              .toList()
          : List.of();
      return new BingoPublicCell(cell.id(), cell.conditions(), assigned.map(BingoPokemonView::of).orElse(null),
          possibleSolutions);
    }).toList();
    return new BingoPublicBoard(playerId, completedCells(board), board.cells().size(), board.lastProgressAt(), cells);
  }

  @Override
  public PokemonBingoState createInitialState(PokemonBingoConfig config, GameContext context) {
    if (config.activeFamilies().isEmpty()) throw new EngineException("Selecciona al menos una familia de condiciones.");
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    int cellCount = config.width() * config.height();
    var pool = context.pokemon().forGenerations(config.generations()).stream()
        .filter(pokemon -> PokemonBingoRules.hasCompleteBingoMetadata(pokemon, config))
        .toList();
    if (pool.size() < cellCount) {
      throw new EngineException("No se puede generar un tablero " + config.width() + "×" + config.height()
          + ": el pool solo contiene " + pool.size() + " Pokémon válidos.");
    }
    var templates = PokemonBingoGenerator.buildBingoConditionTemplates(pool, config, context.random());
    var signatures = new HashSet<String>();
    var boards = new LinkedHashMap<String, BingoBoardState>();
    for (int index = 0; index < context.players().size(); index++) {
      var generated = PokemonBingoGenerator.generateBingoBoard(templates, pool, config.width(), config.height(),
          context.random(), signatures, index * 97);
      signatures.add(generated.signature());
      boards.put(context.players().get(index).id(),
          new BingoBoardState(generated.cells(), Map.of(), generated.solutionPokemonIds(), context.now()));
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var playerStats = new LinkedHashMap<String, BingoPlayerStats>();
    for (var id : playerIds) playerStats.put(id, BingoPlayerStats.ZERO);
    return PokemonBingoState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .boards(boards)
        .playerStats(playerStats)
        .gameStartedAt(context.now())
        .build();
  }

  @Override
  public PokemonBingoState start(PokemonBingoState state, GameContext context) {
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .gameStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().durationSeconds() * 1_000L)
        .build();
  }

  @Override
  public GameActionResult<PokemonBingoState> handleAction(PokemonBingoState state, String playerId,
      PokemonBingoAction action, GameContext context) {
    if (action instanceof PokemonBingoAction.SkipResults) {
      if (state.phase() != GamePhase.ROUND_RESULTS) {
        return GameActionResult.reject(state, "El resultado todavía no se puede saltar.");
      }
      if (context.hostId() == null || context.hostId().isEmpty() || !playerId.equals(context.hostId())) {
        return GameActionResult.reject(state, "Solo el host puede continuar.");
      }
      return GameActionResult.accept(finish(state));
    }
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La partida ya ha terminado.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes modificar este tablero.");
    }
    boolean timeUp = Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt());
    if (timeUp) return GameActionResult.reject(finish(state), "El tiempo ha terminado.");
    var board = state.boards().get(playerId);
    if (action instanceof PokemonBingoAction.RemovePokemon remove) {
      if (findCell(board, remove.cellId()).isEmpty()) return GameActionResult.reject(state, "Casilla desconocida.");
      var current = board.assignments().get(remove.cellId());
      if (current == null || current.isEmpty()) return GameActionResult.reject(state, "La casilla ya está vacía.");
      var assignments = new LinkedHashMap<>(board.assignments());
      assignments.remove(remove.cellId());
      return GameActionResult.accept(state.toBuilder()
          .boards(with(state.boards(), playerId, board.withProgress(assignments, context.now())))
          .build());
    }
    if (Timing.cooldownRemainingMs(context.now(), state.cooldownUntil().get(playerId)) > 0) {
      return GameActionResult.reject(state, "Espera un momento antes de confirmar otro Pokémon.");
    }
    if (action instanceof PokemonBingoAction.MovePokemon move) {
      if (move.fromCellId().equals(move.toCellId())) {
        return GameActionResult.reject(state, "Selecciona otra casilla de destino.");
      }
      var target = findCell(board, move.toCellId());
      var pokemonId = board.assignments().get(move.fromCellId());
      var pokemon = pokemonId != null && !pokemonId.isEmpty()
          ? context.pokemon().byId(pokemonId)
          : Optional.<Pokemon>empty();
      if (findCell(board, move.fromCellId()).isEmpty() || target.isEmpty() || pokemon.isEmpty()) {
        return GameActionResult.reject(state, "Movimiento inválido.");
      }
      var moved = pokemon.get();
      if (!ConditionRules.pokemonMatchesBingoCell(moved, target.get())) {
        var attempt = BingoPrivateAttempt.of(target.get().id(), moved, context.now(), false,
            "❌ " + moved.name() + " no cumple la casilla de destino.");
        return GameActionResult.accept(incorrectAttempt(state, playerId, attempt));
      }
      var assignments = new LinkedHashMap<>(board.assignments());
      assignments.remove(move.fromCellId());
      assignments.put(move.toCellId(), moved.id());
      var nextBoard = board.withProgress(assignments, context.now());
      return GameActionResult.accept(
          validAssignmentState(state, playerId, nextBoard, moved, move.toCellId(), context));
    }
    var assign = (PokemonBingoAction.AssignPokemon) action;
    var cell = findCell(board, assign.cellId());
    var pokemon = context.pokemon().byId(assign.pokemonId());
    if (cell.isEmpty() || pokemon.isEmpty() || !state.poolIds().contains(pokemon.get().id())) {
      return GameActionResult.reject(state, "Pokémon o casilla fuera del pool configurado.");
    }
    var chosen = pokemon.get();
    var target = cell.get();
    if (!ConditionRules.pokemonMatchesBingoCell(chosen, target)) {
      var attempt = BingoPrivateAttempt.of(target.id(), chosen, context.now(), false,
          "❌ " + chosen.name() + " no cumple esta casilla.");
      return GameActionResult.accept(incorrectAttempt(state, playerId, attempt));
    }
    var existingCell = assignedCell(board, chosen.id());
    if (existingCell.isPresent() && !existingCell.get().equals(target.id()) && !assign.moveExisting()) {
      var source = findCell(board, existingCell.get()).orElseThrow();
      return GameActionResult.reject(state, chosen.name() + " ya está usado en “"
          + source.conditions().stream().map(ConditionRules::describeBingoCondition)
              .collect(Collectors.joining(" + "))
          + "”. Confirma para moverlo.");
    }
    if (existingCell.isPresent() && existingCell.get().equals(target.id())) return GameActionResult.accept(state);
    var assignments = new LinkedHashMap<>(board.assignments());
    existingCell.ifPresent(assignments::remove);
    assignments.put(target.id(), chosen.id());
    var nextBoard = board.withProgress(assignments, context.now());
    return GameActionResult.accept(validAssignmentState(state, playerId, nextBoard, chosen, target.id(), context));
  }

  @Override
  public PokemonBingoState handleTimeout(PokemonBingoState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return finish(state);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return finish(state);
    }
    return state;
  }

  @Override
  public PokemonBingoPublicState getPublicState(PokemonBingoState state, GameContext context) {
    var boards = new LinkedHashMap<String, BingoPublicBoard>();
    for (var id : state.playerIds()) boards.put(id, publicBoard(state, id, context));
    return new PokemonBingoPublicState(ID, state.phase(), state.config().width(), state.config().height(),
        state.roundEndsAt(), state.nextTransitionAt(), state.winnerId(), state.bingoAt(), boards,
        state.phase() == GamePhase.GAME_RESULTS ? buildPokemonBingoResults(state) : null);
  }

  @Override
  public PokemonBingoPlayerState getPlayerState(PokemonBingoState state, String playerId, GameContext context) {
    return new PokemonBingoPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId),
        state.cooldownUntil().get(playerId),
        state.lastAttempts().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(PokemonBingoState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .build();
  }

  @Override
  public boolean isFinished(PokemonBingoState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonBingoState state) {
    return buildPokemonBingoResults(state);
  }
}
