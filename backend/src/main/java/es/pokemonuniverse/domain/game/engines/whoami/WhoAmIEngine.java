package es.pokemonuniverse.domain.game.engines.whoami;

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
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIAction;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIAnswer;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIAnswerEntry;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmICurrentQuestion;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIHistoryEntry;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIOpenQuestion;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPlayerState;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPlayerStats;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPokemon;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPublicState;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIResultEntry;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIState;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmITurnStep;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * ¿Quién soy?: cada jugador tiene un Pokémon que ven todos menos él. El turno va de {@code ASKING} (pregunta de sí o
 * no, o adivinar directamente) a {@code ANSWERING} (responden los demás necesarios, también los que ya acertaron) y a
 * {@code DECIDING} (adivinar una vez o pasar). Un fallo acaba el turno. Acertar da
 * {@code max(2, 10 − preguntas) + bonus por orden}. {@code roundEndsAt} es el plazo del paso ({@code turnEndsAt}
 * público), como en Quién es Quién.
 */
public final class WhoAmIEngine
    implements GameEngine<WhoAmIConfig, WhoAmIState, WhoAmIAction, WhoAmIPublicState> {

  public static final String ID = "who-am-i";

  private static final String SPECTATING = "Estás observando esta partida.";
  private static final String NOT_YOUR_TURN = "No es tu turno.";
  private static final String NO_QUESTION = "No hay ninguna pregunta que responder.";

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public WhoAmIEngine(GameManifest manifest) {
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
  public WhoAmIConfig parseConfig(JsonNode raw) {
    return WhoAmIConfig.parse(raw);
  }

  @Override
  public WhoAmIAction parseAction(JsonNode raw) {
    return WhoAmIAction.parse(raw);
  }

  @Override
  public WhoAmIConfig defaultConfig() {
    return WhoAmIConfig.defaults();
  }

  @Override
  public Optional<String> checkAvailability(WhoAmIConfig config, GameContext context) {
    return WhoAmIRules.availabilityIssue(config, context.pokemon(), context.players().size());
  }

  // --- Turnos -------------------------------------------------------------------------------------------------------

  private static boolean isActive(WhoAmIState state) {
    return state.phase() == GamePhase.TURN_ACTIVE;
  }

  private static @Nullable String turnPlayerId(WhoAmIState state) {
    return isActive(state) ? state.playerIds().get(state.turnIndex()) : null;
  }

  /** Elegible para tener turno: no ha acertado y está conectado y activo. */
  private static boolean eligible(WhoAmIState state, GameContext context, String playerId) {
    return !state.solvedPlayerIds().contains(playerId) && context.isPlayerRequired(playerId);
  }

  /** Quienes deben responder: los jugadores necesarios menos el del turno, hayan acertado o no. */
  private static List<String> answerers(WhoAmIState state, GameContext context) {
    var turn = turnPlayerId(state);
    return state.playerIds().stream().filter(id -> !id.equals(turn) && context.isPlayerRequired(id)).toList();
  }

  private static @Nullable WhoAmIAnswer answerOf(@Nullable WhoAmIOpenQuestion question, String playerId) {
    if (question == null) return null;
    for (var entry : question.answers()) {
      if (entry.playerId().equals(playerId)) return entry.answer();
    }
    return null;
  }

  /** Abre el paso {@code ASKING} del turno {@code next}; el plazo es {@code askSeconds}. */
  private static WhoAmIState openTurn(WhoAmIState state, WhoAmIRules.NextTurn next, GameContext context) {
    return state.toBuilder()
        .lap(next.lap())
        .turnIndex(next.turnIndex())
        .turnStep(WhoAmITurnStep.ASKING)
        .currentQuestion(null)
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().askSeconds() * 1_000L)
        .build();
  }

  /** Paso a {@code DECIDING} con la pregunta aún abierta; el plazo es {@code DECIDE_MS}. */
  private static WhoAmIState toDeciding(WhoAmIState state, GameContext context) {
    return state.toBuilder()
        .turnStep(WhoAmITurnStep.DECIDING)
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + WhoAmIRules.DECIDE_MS)
        .build();
  }

  /** En {@code ANSWERING}, cierra el paso si ya han respondido todos los que deben (también si no queda nadie). */
  private static WhoAmIState closeAnsweringIfComplete(WhoAmIState state, GameContext context) {
    if (!isActive(state) || state.turnStep() != WhoAmITurnStep.ANSWERING) return state;
    var question = Objects.requireNonNull(state.currentQuestion(), "currentQuestion");
    for (var id : answerers(state, context)) {
      if (answerOf(question, id) == null) return state;
    }
    return toDeciding(state, context);
  }

  private static Map<String, List<WhoAmIHistoryEntry>> appendHistory(WhoAmIState state, String playerId,
      WhoAmIHistoryEntry entry) {
    var history = new LinkedHashMap<>(state.history());
    var entries = new ArrayList<>(history.getOrDefault(playerId, List.of()));
    entries.add(entry);
    history.put(playerId, entries);
    return history;
  }

  /**
   * Termina el turno, sea cual sea el motivo: la pregunta abierta entra en el historial del que pregunta con las
   * respuestas que tenga, y se abre el siguiente turno elegible o se acaba la partida.
   */
  private static WhoAmIState endTurn(WhoAmIState state, GameContext context) {
    var turn = Objects.requireNonNull(turnPlayerId(state), "turnPlayerId");
    var question = state.currentQuestion();
    var closed = question == null ? state : state.toBuilder()
        .history(appendHistory(state, turn, new WhoAmIHistoryEntry.Question(question.text(), question.answers())))
        .currentQuestion(null)
        .build();
    if (closed.solvedPlayerIds().size() == closed.playerIds().size()) return finish(closed);
    var next = WhoAmIRules.nextTurn(closed.playerIds(), closed.turnIndex(), closed.lap(), closed.config().maxLaps(),
        id -> eligible(closed, context, id));
    return next.map(turnSlot -> openTurn(closed, turnSlot, context)).orElseGet(() -> finish(closed));
  }

  /** Fin de partida: suma la partida a las estadísticas de cada jugador y cierra el turno. */
  private static WhoAmIState finish(WhoAmIState state) {
    var playerStats = new LinkedHashMap<String, WhoAmIPlayerStats>();
    var first = state.solvedPlayerIds().isEmpty() ? null : state.solvedPlayerIds().getFirst();
    for (var id : state.playerIds()) {
      playerStats.put(id, state.playerStats().getOrDefault(id, WhoAmIPlayerStats.ZERO).afterGame(
          state.solvedPlayerIds().contains(id),
          state.questionsAsked().getOrDefault(id, 0),
          state.wrongGuesses().getOrDefault(id, 0),
          id.equals(first),
          state.scores().getOrDefault(id, 0)));
    }
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .turnStep(null)
        .currentQuestion(null)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .build();
  }

  // --- Ciclo --------------------------------------------------------------------------------------------------------

  /** No consume {@code random}: el reparto va en {@link #start}. */
  @Override
  public WhoAmIState createInitialState(WhoAmIConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var issue = checkAvailability(config, context);
    if (issue.isPresent()) throw new EngineException(issue.get());
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var history = new LinkedHashMap<String, List<WhoAmIHistoryEntry>>();
    var zeros = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, WhoAmIPlayerStats>();
    for (var id : playerIds) {
      history.put(id, List.of());
      zeros.put(id, 0);
      playerStats.put(id, WhoAmIPlayerStats.ZERO);
    }
    return WhoAmIState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .history(history)
        .questionsAsked(zeros)
        .wrongGuesses(zeros)
        .scores(zeros)
        .playerStats(playerStats)
        .build();
  }

  /** Reparte (una barajada del pool con {@code random}) y abre el turno del primer elegible. */
  @Override
  public WhoAmIState start(WhoAmIState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    var pool = WhoAmIRules.pool(state.config(), context.pokemon());
    var dealt = state.toBuilder()
        .phase(GamePhase.TURN_ACTIVE)
        .assignments(WhoAmIRules.deal(state.playerIds(), pool, context.random()))
        .build();
    return WhoAmIRules.firstTurn(dealt.playerIds(), id -> eligible(dealt, context, id))
        .map(turnSlot -> openTurn(dealt, turnSlot, context))
        .orElseGet(() -> finish(dealt));
  }

  /**
   * Una acción tardía (pasado el plazo pero antes del {@code handleTimeout}) se trata como a tiempo: no hay literal de
   * tiempo agotado y el paso aún no ha cambiado.
   */
  @Override
  public GameActionResult<WhoAmIState> handleAction(WhoAmIState state, String playerId, WhoAmIAction action,
      GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, SPECTATING);
    }
    if (action instanceof WhoAmIAction.Answer answer) return handleAnswer(state, playerId, answer.answer(), context);
    if (!isActive(state) || !playerId.equals(turnPlayerId(state))) return GameActionResult.reject(state, NOT_YOUR_TURN);
    return switch (action) {
      case WhoAmIAction.Ask ask -> handleAsk(state, playerId, ask.text(), context);
      case WhoAmIAction.GuessSelf guess -> handleGuess(state, playerId, guess.pokemonId(), context);
      case WhoAmIAction.Pass pass -> state.turnStep() != WhoAmITurnStep.DECIDING
          ? GameActionResult.reject(state, "Solo puedes pasar después de las respuestas.")
          : GameActionResult.accept(endTurn(state, context));
      case WhoAmIAction.Answer answer -> throw new IllegalStateException("ya tratada");
    };
  }

  private static GameActionResult<WhoAmIState> handleAsk(WhoAmIState state, String playerId, String text,
      GameContext context) {
    if (state.turnStep() != WhoAmITurnStep.ASKING) return GameActionResult.reject(state, "Ahora no toca preguntar.");
    var questionsAsked = new LinkedHashMap<>(state.questionsAsked());
    questionsAsked.put(playerId, questionsAsked.getOrDefault(playerId, 0) + 1);
    var asked = state.toBuilder()
        .turnStep(WhoAmITurnStep.ANSWERING)
        .currentQuestion(new WhoAmIOpenQuestion(text, List.of()))
        .questionsAsked(questionsAsked)
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().answerSeconds() * 1_000L)
        .build();
    return GameActionResult.accept(closeAnsweringIfComplete(asked, context));
  }

  /**
   * Con la pregunta abierta (también en {@code DECIDING}), quien ya respondió oye «Ya has respondido.»; si no, fuera de
   * {@code ANSWERING} no hay nada que responder.
   */
  private static GameActionResult<WhoAmIState> handleAnswer(WhoAmIState state, String playerId, WhoAmIAnswer answer,
      GameContext context) {
    var question = state.currentQuestion();
    if (!isActive(state) || question == null) return GameActionResult.reject(state, NO_QUESTION);
    if (playerId.equals(turnPlayerId(state))) {
      return GameActionResult.reject(state, "No puedes responder tu propia pregunta.");
    }
    if (answerOf(question, playerId) != null) return GameActionResult.reject(state, "Ya has respondido.");
    if (state.turnStep() != WhoAmITurnStep.ANSWERING) return GameActionResult.reject(state, NO_QUESTION);
    var answers = new ArrayList<>(question.answers());
    answers.add(new WhoAmIAnswerEntry(playerId, answer));
    var next = state.toBuilder().currentQuestion(new WhoAmIOpenQuestion(question.text(), answers)).build();
    return GameActionResult.accept(closeAnsweringIfComplete(next, context));
  }

  /**
   * Vale en {@code ASKING} y en {@code DECIDING}; acierte o falle, el turno pasa (así solo se adivina una vez). El
   * Pokémon de otro jugador se rechaza sin más.
   */
  private static GameActionResult<WhoAmIState> handleGuess(WhoAmIState state, String playerId, String pokemonId,
      GameContext context) {
    if (state.turnStep() != WhoAmITurnStep.ASKING && state.turnStep() != WhoAmITurnStep.DECIDING) {
      return GameActionResult.reject(state, "Ahora no puedes adivinar.");
    }
    var guessed = WhoAmIRules.pool(state.config(), context.pokemon()).stream()
        .filter(pokemon -> pokemon.id().equals(pokemonId)).findFirst();
    if (guessed.isEmpty()) {
      return GameActionResult.reject(state, "Ese Pokémon no está en las generaciones de la partida.");
    }
    var own = Objects.requireNonNull(state.assignments().get(playerId), "assignment");
    // El de otro jugador nunca es el propio, y como fallo entraría en el historial público: su dueño lo vería.
    // Quien adivina ya ve esa carta, así que el rechazo no le revela nada. No cuenta como fallo ni pasa el turno.
    boolean takenByOther = state.assignments().entrySet().stream()
        .anyMatch(entry -> !entry.getKey().equals(playerId) && entry.getValue().id().equals(pokemonId));
    if (takenByOther) return GameActionResult.reject(state, "Ese Pokémon lo tiene otro jugador.");
    if (own.id().equals(pokemonId)) {
      int order = state.solvedPlayerIds().size() + 1;
      int points = WhoAmIRules.solvePoints(state.questionsAsked().getOrDefault(playerId, 0), order);
      var solved = new ArrayList<>(state.solvedPlayerIds());
      solved.add(playerId);
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, scores.getOrDefault(playerId, 0) + points);
      return GameActionResult.accept(endTurn(state.toBuilder().solvedPlayerIds(solved).scores(scores).build(),
          context));
    }
    // El fallo va después de la pregunta del turno: se cierra aquí la pregunta y endTurn ya no la vuelve a meter.
    var pokemon = guessed.get();
    var miss = new WhoAmIHistoryEntry.Guess(new WhoAmIPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(),
        pokemon.nationalDexNumber(), pokemon.types()));
    var wrongGuesses = new LinkedHashMap<>(state.wrongGuesses());
    wrongGuesses.put(playerId, wrongGuesses.getOrDefault(playerId, 0) + 1);
    var question = state.currentQuestion();
    var closed = question == null ? state : state.toBuilder()
        .history(appendHistory(state, playerId, new WhoAmIHistoryEntry.Question(question.text(), question.answers())))
        .currentQuestion(null)
        .build();
    var next = closed.toBuilder()
        .history(appendHistory(closed, playerId, miss))
        .wrongGuesses(wrongGuesses)
        .build();
    return GameActionResult.accept(endTurn(next, context));
  }

  /** {@code ASKING} y {@code DECIDING} vencidos pasan el turno; {@code ANSWERING} vencido pasa a decidir. */
  @Override
  public WhoAmIState handleTimeout(WhoAmIState state, GameContext context) {
    if (!isActive(state) || !Timing.deadlineReached(context.now(), state.roundEndsAt())) return state;
    return state.turnStep() == WhoAmITurnStep.ANSWERING ? toDeciding(state, context) : endTurn(state, context);
  }

  /** Si el jugador del turno deja de ser necesario, el turno pasa; si no, quizá ya no falta nadie por responder. */
  @Override
  public WhoAmIState handlePresenceChange(WhoAmIState state, GameContext context) {
    if (!isActive(state)) return state;
    if (!context.isPlayerRequired(Objects.requireNonNull(turnPlayerId(state), "turnPlayerId"))) {
      return endTurn(state, context);
    }
    return closeAnsweringIfComplete(state, context);
  }

  // --- Proyecciones -------------------------------------------------------------------------------------------------

  private static List<WhoAmIResultEntry> results(WhoAmIState state) {
    return WhoAmIRules.buildResults(state).standings().stream()
        .map(standing -> new WhoAmIResultEntry(standing.playerId(), state.assignments().get(standing.playerId()),
            state.solvedPlayerIds().contains(standing.playerId()),
            state.questionsAsked().getOrDefault(standing.playerId(), 0), standing.points(), standing.position()))
        .toList();
  }

  /**
   * No lleva ningún Pokémon asignado hasta {@code GAME_RESULTS}, donde {@code results} los revela todos. Mientras se
   * responde ({@code ANSWERING}) solo se publica quién ha respondido: qué respondió cada uno sale en {@code DECIDING}
   * (la respuesta propia va en {@code ownAnswer}, en la proyección de cada jugador).
   */
  @Override
  public WhoAmIPublicState getPublicState(WhoAmIState state, GameContext context) {
    var question = state.currentQuestion();
    var current = question == null ? null : new WhoAmICurrentQuestion(question.text(),
        state.turnStep() == WhoAmITurnStep.ANSWERING ? List.of() : question.answers(),
        question.answers().stream().map(WhoAmIAnswerEntry::playerId).toList());
    return WhoAmIPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .lap(state.lap())
        .maxLaps(state.config().maxLaps())
        .playerIds(state.playerIds())
        .turnPlayerId(turnPlayerId(state))
        .turnStep(isActive(state) ? state.turnStep() : null)
        .currentQuestion(current)
        .history(state.history())
        .solvedPlayerIds(state.solvedPlayerIds())
        .questionsAsked(state.questionsAsked())
        .scores(state.scores())
        .turnEndsAt(state.roundEndsAt())
        .results(state.phase() == GamePhase.GAME_RESULTS ? results(state) : null)
        .build();
  }

  /**
   * {@code SPECTATOR} solo si el id no está en {@code playerIds}: recibe todos los Pokémon. Un jugador original, aunque
   * no sea necesario (desconectado o inactivo), es {@code PLAYER}: su {@code others} le excluye y {@code self} es nulo
   * hasta que acierte. Los permisos exigen además que sea necesario.
   */
  @Override
  public WhoAmIPlayerState getPlayerState(WhoAmIState state, String playerId, GameContext context) {
    if (!state.playerIds().contains(playerId)) return WhoAmIPlayerState.spectator(state.assignments());
    var others = new LinkedHashMap<String, WhoAmIPokemon>();
    state.assignments().forEach((id, pokemon) -> {
      if (!id.equals(playerId)) others.put(id, pokemon);
    });
    boolean solved = state.solvedPlayerIds().contains(playerId);
    boolean live = isActive(state) && context.isPlayerRequired(playerId);
    boolean ownTurn = live && playerId.equals(turnPlayerId(state));
    var step = state.turnStep();
    var ownAnswer = answerOf(state.currentQuestion(), playerId);
    return WhoAmIPlayerState.builder()
        .others(others)
        .self(solved ? state.assignments().get(playerId) : null)
        .canAsk(ownTurn && step == WhoAmITurnStep.ASKING)
        .canAnswer(live && !ownTurn && step == WhoAmITurnStep.ANSWERING && ownAnswer == null)
        .canGuess(ownTurn && (step == WhoAmITurnStep.ASKING || step == WhoAmITurnStep.DECIDING))
        .canPass(ownTurn && step == WhoAmITurnStep.DECIDING)
        .ownAnswer(ownAnswer)
        .build();
  }

  /**
   * La época cambia con cada paso ({@code roundStartedAt}), con el turno ({@code turnIndex}) y con la vuelta
   * ({@code roundNumber}); una respuesta no la cambia.
   */
  @Override
  public GameLifecycle getLifecycle(WhoAmIState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.lap())
        .turnIndex(state.turnIndex())
        .build();
  }

  @Override
  public boolean isFinished(WhoAmIState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(WhoAmIState state) {
    return WhoAmIRules.buildResults(state);
  }
}
