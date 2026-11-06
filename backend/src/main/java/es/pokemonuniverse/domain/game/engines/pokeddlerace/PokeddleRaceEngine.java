package es.pokemonuniverse.domain.game.engines.pokeddlerace;

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
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleBoardRow;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddlePlayerStats;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddlePokemonReveal;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddlePublicBoard;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleRaceAction;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleRacePlayerState;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleRacePublicState;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleRaceState;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleRoundGuess;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleSolve;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code pokeddle-race/server.ts}. */
public final class PokeddleRaceEngine
    implements GameEngine<PokeddleRaceConfig, PokeddleRaceState, PokeddleRaceAction, PokeddleRacePublicState> {

  public static final String ID = "pokeddle-race";
  public static final long REVEAL_MS = 3_000;

  private static final TimedRoundStrategy<PokeddleRaceState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public PokeddleRaceState beginNext(PokeddleRaceState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public PokeddleRaceState resolveActive(PokeddleRaceState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public PokeddleRaceState finish(PokeddleRaceState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(PokeddleRaceState state) {
      return eligibleUnsolved(state).isEmpty() || state.roundNumber() >= state.config().maxRounds();
    }
  };

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokeddleRaceEngine(GameManifest manifest) {
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
  public PokeddleRaceConfig parseConfig(JsonNode raw) {
    return PokeddleRaceConfig.parse(raw);
  }

  @Override
  public PokeddleRaceAction parseAction(JsonNode raw) {
    return PokeddleRaceAction.parse(raw);
  }

  @Override
  public PokeddleRaceConfig defaultConfig() {
    return PokeddleRaceConfig.defaults();
  }

  private static PokeddlePokemonReveal reveal(Pokemon pokemon) {
    return new PokeddlePokemonReveal(pokemon.id(), pokemon.name(), pokemon.sprite());
  }

  /** {@code context.pokemon.byId(id)!}: el TS asume que existe. */
  private static Pokemon pokemon(GameContext context, String id) {
    return context.pokemon().byId(id).orElseThrow(() -> new EngineException("Pokémon desconocido: " + id));
  }

  private static List<String> eligibleUnsolved(PokeddleRaceState state) {
    return state.playerIds().stream().filter(id -> !state.solved().containsKey(id)).toList();
  }

  private static boolean allRequiredGuessed(PokeddleRaceState state, GameContext context) {
    return context.connectedRequiredPlayerIds(eligibleUnsolved(state)).stream()
        .allMatch(id -> state.currentGuesses().containsKey(id));
  }

  private static PokeddleRaceState beginRound(PokeddleRaceState state, GameContext context) {
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .currentGuesses(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .build();
  }

  private static PokeddleRaceState resolveRound(PokeddleRaceState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var boards = new LinkedHashMap<String, List<PokeddleBoardRow>>();
    state.boards().forEach((id, rows) -> boards.put(id, new ArrayList<>(rows)));
    var solved = new LinkedHashMap<>(state.solved());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : eligibleUnsolved(state)) {
      var prior = Objects.requireNonNull(state.playerStats().get(playerId), "playerStats");
      var answer = state.currentGuesses().get(playerId);
      PokeddlePlayerStats stats;
      PokeddleBoardRow row;
      if (answer == null) {
        stats = prior.afterMissedRound();
        row = new PokeddleBoardRow(state.roundNumber(), "NO_GUESS", null, null, false, null);
      } else {
        var guess = pokemon(context, answer.pokemonId());
        var secret = pokemon(context, state.secretPokemonIds().get(playerId));
        stats = prior.afterGuess();
        boolean correct = guess.id().equals(secret.id());
        row = new PokeddleBoardRow(state.roundNumber(), "GUESS", reveal(guess),
            PokeddleRaceRules.buildPokeddleFeedback(guess, secret, state.config(), state.evolutions()), correct, answer.submittedAt());
        if (correct) {
          solved.put(playerId, new PokeddleSolve(state.roundNumber(), stats.validGuesses(), answer.submittedAt()));
        }
      }
      boards.get(playerId).add(row);
      playerStats.put(playerId, stats);
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .boards(boards)
        .solved(solved)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .build();
  }

  /** Orden estable de {@code Array.prototype.sort}: resueltos por ronda, intentos, momento y orden de jugador. */
  private static List<String> ranking(PokeddleRaceState state) {
    var order = new HashMap<String, Integer>();
    for (int index = 0; index < state.playerIds().size(); index++) order.put(state.playerIds().get(index), index);
    var ordered = new ArrayList<>(state.playerIds());
    ordered.sort((left, right) -> {
      var a = state.solved().get(left);
      var b = state.solved().get(right);
      if (a != null && b == null) return -1;
      if (a == null && b != null) return 1;
      if (a != null) {
        int byRound = Integer.compare(a.round(), b.round());
        if (byRound != 0) return byRound;
        int byGuesses = Integer.compare(a.validGuesses(), b.validGuesses());
        if (byGuesses != 0) return byGuesses;
        int byTime = Long.compare(a.solvedAt(), b.solvedAt());
        return byTime != 0 ? byTime : Integer.compare(order.get(left), order.get(right));
      }
      var aStats = state.playerStats().get(left);
      var bStats = state.playerStats().get(right);
      int byGuesses = Integer.compare(bStats.validGuesses(), aStats.validGuesses());
      if (byGuesses != 0) return byGuesses;
      int byMissed = Integer.compare(aStats.missedRounds(), bStats.missedRounds());
      return byMissed != 0 ? byMissed : Integer.compare(order.get(left), order.get(right));
    });
    return ordered;
  }

  /** {@code buildPokeddleResults}: sin guarda de fase, como el TS. */
  public static GameResults buildPokeddleResults(PokeddleRaceState state) {
    var ordered = ranking(state);
    var firstSolved = ordered.stream().filter(id -> state.solved().containsKey(id)).findFirst().orElse(null);
    var standings = new ArrayList<GameStanding>();
    for (int index = 0; index < ordered.size(); index++) {
      var playerId = ordered.get(index);
      var solve = state.solved().get(playerId);
      var stats = state.playerStats().get(playerId);
      boolean resolved = solve != null;
      var resultStats = new LinkedHashMap<String, Number>();
      resultStats.put("resolved", resolved ? 1 : 0);
      resultStats.put("unresolved", resolved ? 0 : 1);
      resultStats.put("totalGuesses", stats.validGuesses());
      resultStats.put("guessesToSolveTotal", resolved ? solve.validGuesses() : 0);
      resultStats.put("resolutionRoundsTotal", resolved ? solve.round() : 0);
      resultStats.put("bestResolutionRounds", resolved ? solve.round() : 0);
      resultStats.put("bestTimeMs", resolved ? solve.solvedAt() - state.gameStartedAt() : 0L);
      resultStats.put("missedRounds", stats.missedRounds());
      resultStats.put("roundsParticipated", stats.roundsParticipated());
      standings.add(new GameStanding(playerId, index + 1,
          resolved ? Scoring.pointsForPosition(ordered.size(), index + 1) : 0, playerId.equals(firstSolved),
          resultStats));
    }
    return new GameResults(firstSolved, standings);
  }

  private static PokeddlePublicBoard publicBoard(PokeddleRaceState state, String playerId, GameContext context) {
    var solve = state.solved().get(playerId);
    boolean mayReveal = solve != null || state.phase() == GamePhase.GAME_RESULTS;
    var secret = mayReveal ? context.pokemon().byId(state.secretPokemonIds().get(playerId)).orElse(null) : null;
    var stats = state.playerStats().get(playerId);
    return new PokeddlePublicBoard(playerId, state.boards().get(playerId), solve != null,
        solve == null ? null : solve.round(), solve == null ? null : solve.solvedAt(), stats.validGuesses(),
        stats.missedRounds(), secret != null ? reveal(secret) : null);
  }

  /** Consume {@code random} al barajar el pool (una extracción por Pokémon menos uno). */
  @Override
  public PokeddleRaceState createInitialState(PokeddleRaceConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    if (config.activeClues().isEmpty()) throw new EngineException("Selecciona al menos una pista.");
    var pool = context.pokemon().forGenerations(config.generations()).stream()
        .filter(pokemon -> PokeddleRaceRules.hasCompletePokeddleMetadata(pokemon, config))
        .toList();
    if (pool.isEmpty()) throw new EngineException("No hay Pokémon con datos completos para esta configuración.");
    var shuffled = PokeddleRaceRules.shufflePokeddlePool(pool, context.random());
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var secrets = new LinkedHashMap<String, String>();
    var boards = new LinkedHashMap<String, List<PokeddleBoardRow>>();
    var playerStats = new LinkedHashMap<String, PokeddlePlayerStats>();
    for (int index = 0; index < playerIds.size(); index++) {
      var id = playerIds.get(index);
      secrets.put(id, shuffled.get(index % shuffled.size()).id());
      boards.put(id, List.of());
      playerStats.put(id, PokeddlePlayerStats.ZERO);
    }
    return PokeddleRaceState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .evolutions(PokeddleEvolutions.forPool(context.pokemon(), pool, config.generations()))
        .secretPokemonIds(secrets)
        .roundNumber(0)
        .boards(boards)
        .playerStats(playerStats)
        .gameStartedAt(context.now())
        .build();
  }

  @Override
  public PokeddleRaceState start(PokeddleRaceState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<PokeddleRaceState> handleAction(PokeddleRaceState state, String playerId,
      PokeddleRaceAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta ronda.");
    }
    if (state.solved().containsKey(playerId)) return GameActionResult.reject(state, "Ya has encontrado tu Pokémon.");
    if (state.currentGuesses().containsKey(playerId)) {
      return GameActionResult.reject(state, "Ya has respondido en esta ronda.");
    }
    if (context.now() >= (state.roundEndsAt() == null ? 0 : state.roundEndsAt())) {
      return GameActionResult.reject(resolveRound(state, context), "El tiempo ha terminado.");
    }
    var pokemon = context.pokemon().byId(action.pokemonId()).orElse(null);
    if (pokemon == null || !state.poolIds().contains(pokemon.id())) {
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
    }
    var currentGuesses = new LinkedHashMap<>(state.currentGuesses());
    currentGuesses.put(playerId, new PokeddleRoundGuess(pokemon.id(), context.now()));
    var next = state.toBuilder().currentGuesses(currentGuesses).build();
    if (allRequiredGuessed(next, context)) next = resolveRound(next, context);
    return GameActionResult.accept(next);
  }

  @Override
  public PokeddleRaceState handleTimeout(PokeddleRaceState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public PokeddleRaceState handlePresenceChange(PokeddleRaceState state, GameContext context) {
    return state.phase() == GamePhase.ROUND_ACTIVE && allRequiredGuessed(state, context)
        ? resolveRound(state, context)
        : state;
  }

  @Override
  public PokeddleRacePublicState getPublicState(PokeddleRaceState state, GameContext context) {
    var boards = new LinkedHashMap<String, PokeddlePublicBoard>();
    for (var id : state.playerIds()) boards.put(id, publicBoard(state, id, context));
    return new PokeddleRacePublicState(ID, state.phase(), state.roundNumber(), state.config().maxRounds(),
        state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        new ArrayList<>(state.currentGuesses().keySet()), eligibleUnsolved(state), boards,
        state.config().activeClues(),
        state.phase() == GamePhase.GAME_RESULTS ? buildPokeddleResults(state) : null);
  }

  @Override
  public PokeddleRacePlayerState getPlayerState(PokeddleRaceState state, String playerId, GameContext context) {
    return new PokeddleRacePlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId) && !state.solved().containsKey(playerId)
            && !state.currentGuesses().containsKey(playerId),
        state.currentGuesses().containsKey(playerId),
        state.solved().containsKey(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(PokeddleRaceState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokeddleRaceState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokeddleRaceState state) {
    return buildPokeddleResults(state);
  }
}
