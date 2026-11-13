package es.pokemonuniverse.domain.game.engines.oddoneout;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutAction;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutPlayerState;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutPlayerStats;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutPublicState;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutRoundResult;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutState;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutVote;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

/**
 * Motor de El Intruso: cada ronda, cuatro Pokémon (tres de una categoría secreta y el intruso); cada jugador vota una
 * vez y el voto queda bloqueado. La ronda se cierra al votar todos los jugadores necesarios o al vencer el plazo, y la
 * revelación dura {@link OddOneOutRules#REVEAL_MS}. Hasta entonces el intruso, la categoría y los votos ajenos solo
 * existen en el estado de servidor.
 */
public final class OddOneOutEngine
    implements GameEngine<OddOneOutConfig, OddOneOutState, OddOneOutAction, OddOneOutPublicState> {

  public static final String ID = "odd-one-out";

  static final String NOT_ACTIVE = "La ronda no está activa.";
  static final String SPECTATING = "Estás observando esta partida.";
  static final String ALREADY_VOTED = "Ya has votado en esta ronda.";
  static final String TIME_UP = "El tiempo de la ronda ha terminado.";
  static final String UNKNOWN_OPTION = "Esa opción no existe.";

  /** Ciclo común activo → revelación → siguiente ronda o fin. */
  private static final TimedRoundStrategy<OddOneOutState> ROUNDS = new TimedRoundStrategy<>() {
    @Override
    public OddOneOutState beginNext(OddOneOutState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public OddOneOutState resolveActive(OddOneOutState state, GameContext context) {
      return revealRound(state, context);
    }

    @Override
    public OddOneOutState finish(OddOneOutState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(OddOneOutState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public OddOneOutEngine(GameManifest manifest) {
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
  public OddOneOutConfig parseConfig(JsonNode raw) {
    return OddOneOutConfig.parse(raw);
  }

  @Override
  public OddOneOutAction parseAction(JsonNode raw) {
    return OddOneOutAction.parse(raw);
  }

  @Override
  public OddOneOutConfig defaultConfig() {
    return OddOneOutConfig.defaults();
  }

  /**
   * Las líneas evolutivas del catálogo del contexto. Se crea en cada llamada: la caché de
   * {@link PokemonConnectionsCatalog#evolutionLines} no es segura entre hilos y no se guarda en el motor.
   */
  private static Function<String, String> lines(GameContext context) {
    return PokemonConnectionsCatalog.evolutionLines(context.pokemon());
  }

  private static List<Pokemon> pool(OddOneOutConfig config, GameContext context) {
    return OddOneOutBoards.pool(config.generations(), context.pokemon());
  }

  /**
   * Si las generaciones dan algún tablero válido. Se comprueba una vez, al crear la partida: con eso
   * {@link OddOneOutBoards#generate} ya no puede fallar a mitad de partida.
   */
  @Override
  public Optional<String> checkAvailability(OddOneOutConfig config, GameContext context) {
    return OddOneOutBoards.availabilityIssue(pool(config, context), lines(context));
  }

  /** No consume azar: el primer tablero sale en {@link #start}. */
  @Override
  public OddOneOutState createInitialState(OddOneOutConfig config, GameContext context) {
    int minPlayers = manifest.minPlayers();
    if (context.players().size() < minPlayers) {
      throw new EngineException("Se necesita al menos " + minPlayers + (minPlayers == 1 ? " jugador." : " jugadores."));
    }
    var issue = checkAvailability(config, context);
    if (issue.isPresent()) throw new EngineException(issue.get());
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, OddOneOutPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, OddOneOutPlayerStats.ZERO);
    }
    return OddOneOutState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public OddOneOutState start(OddOneOutState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  /**
   * Nuevo tablero sin repetir categoría y prefiriendo Pokémon no usados; la categoría y los cuatro Pokémon pasan a
   * las listas de usados.
   */
  private static OddOneOutState beginRound(OddOneOutState state, GameContext context) {
    var board = OddOneOutBoards.generate(pool(state.config(), context), new HashSet<>(state.usedCategoryIds()),
        new HashSet<>(state.usedPokemonIds()), lines(context), context.random());
    var usedCategoryIds = new ArrayList<>(state.usedCategoryIds());
    usedCategoryIds.add(board.category().id());
    var usedPokemonIds = new ArrayList<>(state.usedPokemonIds());
    usedPokemonIds.addAll(board.pokemonIds());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .board(board)
        .usedCategoryIds(usedCategoryIds)
        .usedPokemonIds(usedPokemonIds)
        .votes(new LinkedHashMap<>())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  /**
   * Cierra la ronda: los aciertos se ordenan por {@code votedAt} (y, en empate, por {@code playerIds}) y suman
   * {@link OddOneOutRules#pointsForOrder}; un fallo o no votar, 0. Solo quien votó suma un voto a sus estadísticas.
   */
  private static OddOneOutState revealRound(OddOneOutState state, GameContext context) {
    var board = state.board();
    if (state.phase() != GamePhase.ROUND_ACTIVE || board == null) return state;
    var intruder = board.intruderOptionId();
    var playerOrder = new HashMap<String, Integer>();
    for (int index = 0; index < state.playerIds().size(); index++) {
      playerOrder.put(state.playerIds().get(index), index);
    }
    var correct = state.playerIds().stream()
        .filter(playerId -> state.votes().containsKey(playerId)
            && state.votes().get(playerId).optionId().equals(intruder))
        .sorted(Comparator.<String>comparingLong(playerId -> state.votes().get(playerId).votedAt())
            .thenComparingInt(playerOrder::get))
        .toList();
    var points = new LinkedHashMap<String, Integer>();
    var scores = new LinkedHashMap<>(state.scores());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : state.playerIds()) {
      int order = correct.indexOf(playerId) + 1;
      int gained = order > 0 ? OddOneOutRules.pointsForOrder(order) : 0;
      points.put(playerId, gained);
      scores.put(playerId, scores.getOrDefault(playerId, 0) + gained);
      if (state.votes().containsKey(playerId)) {
        playerStats.put(playerId,
            playerStats.getOrDefault(playerId, OddOneOutPlayerStats.ZERO).afterVote(order > 0));
      }
    }
    var lastRound = new OddOneOutRoundResult(state.roundNumber(), intruder, board.category(), state.votes(), points);
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + OddOneOutRules.REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  /** Quien está en su gracia de reconexión cuenta como conectado; al salir de ella deja de bloquear la ronda. */
  private static OddOneOutState resolveIfComplete(OddOneOutState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.votes().containsKey(id), OddOneOutEngine::revealRound);
  }

  @Override
  public GameActionResult<OddOneOutState> handleAction(OddOneOutState state, String playerId,
      OddOneOutAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.board() == null) {
      return GameActionResult.reject(state, NOT_ACTIVE);
    }
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, SPECTATING);
    }
    if (state.votes().containsKey(playerId)) return GameActionResult.reject(state, ALREADY_VOTED);
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      // El plazo autoritativo ya venció aunque el temporizador no haya llegado: se rechaza y se revela la ronda.
      return GameActionResult.reject(revealRound(state, context), TIME_UP);
    }
    // Inalcanzable desde parseAction (solo admite A–D y el tablero siempre tiene las cuatro); se conserva como guarda.
    if (state.board().options().stream().noneMatch(option -> option.id().equals(action.optionId()))) {
      return GameActionResult.reject(state, UNKNOWN_OPTION);
    }
    var votes = new LinkedHashMap<>(state.votes());
    votes.put(playerId, new OddOneOutVote(action.optionId(), context.now()));
    return GameActionResult.accept(resolveIfComplete(state.toBuilder().votes(votes).build(), context));
  }

  @Override
  public OddOneOutState handleTimeout(OddOneOutState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUNDS);
  }

  @Override
  public OddOneOutState handlePresenceChange(OddOneOutState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  /**
   * Durante {@code ROUND_ACTIVE} solo salen las opciones y quién ha votado (en el orden de {@code playerIds}, no en el
   * de los votos); la revelación ({@code lastRound}) se publica en {@code ROUND_RESULTS} y {@code GAME_RESULTS}.
   */
  @Override
  public OddOneOutPublicState getPublicState(OddOneOutState state, GameContext context) {
    boolean reveal = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    var board = state.board();
    return OddOneOutPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .roundNumber(state.roundNumber())
        .totalRounds(state.config().rounds())
        .playerIds(state.playerIds())
        .options(board == null ? List.of() : board.options())
        .votedPlayerIds(state.playerIds().stream().filter(state.votes()::containsKey).toList())
        .scores(state.scores())
        .roundStartedAt(state.roundStartedAt())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .lastRound(reveal ? state.lastRound() : null)
        .results(state.phase() == GamePhase.GAME_RESULTS ? OddOneOutRules.buildResults(state) : null)
        .build();
  }

  /** Solo el voto propio; un observador recibe {@code canVote: false} y {@code vote: null}. */
  @Override
  public OddOneOutPlayerState getPlayerState(OddOneOutState state, String playerId, GameContext context) {
    boolean participant = state.playerIds().contains(playerId);
    return new OddOneOutPlayerState(
        participant && state.phase() == GamePhase.ROUND_ACTIVE && context.isPlayerRequired(playerId)
            && !state.votes().containsKey(playerId),
        participant ? state.votes().get(playerId) : null);
  }

  @Override
  public GameLifecycle getLifecycle(OddOneOutState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(OddOneOutState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(OddOneOutState state) {
    return OddOneOutRules.buildResults(state);
  }
}
