package es.pokemonuniverse.domain.game.engines.pokemonimpostor;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ClueStatus;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorClue;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorEliminationReveal;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorFinishReason;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorGuess;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorRole;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorVote;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorVoteResult;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorWinner;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorAction;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorPublicState;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorState;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.SecretPokemon;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.VoteResultKind;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.function.DoubleSupplier;

/** Traducción literal de {@code pokemon-impostor/server.ts}. */
public final class PokemonImpostorEngine implements
    GameEngine<PokemonImpostorConfig, PokemonImpostorState, PokemonImpostorAction, PokemonImpostorPublicState> {

  public static final String ID = "pokemon-impostor";
  /** {@code ROLE_REVEAL_MS}. */
  public static final long ROLE_REVEAL_MS = 5_000;
  /** {@code VOTE_RESULTS_MS}. */
  public static final long VOTE_RESULTS_MS = 3_000;
  /** {@code ELIMINATION_MS}. */
  public static final long ELIMINATION_MS = 4_000;
  /** {@code [...text].length > IMPOSTOR_CLUE_MAX_CODE_POINTS}: puntos de código, no unidades UTF-16. */
  static final int MAX_CLUE_CODE_POINTS = PokemonImpostorRules.IMPOSTOR_CLUE_MAX_CODE_POINTS;
  /** Vueltas de pistas antes de cada votación en {@code ONE_WORD}. */
  static final int ONE_WORD_CLUE_LAPS = 2;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonImpostorEngine(GameManifest manifest) {
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
  public PokemonImpostorConfig parseConfig(JsonNode raw) {
    return PokemonImpostorConfig.parse(raw);
  }

  @Override
  public PokemonImpostorAction parseAction(JsonNode raw) {
    return PokemonImpostorAction.parse(raw);
  }

  @Override
  public PokemonImpostorConfig defaultConfig() {
    return PokemonImpostorConfig.defaults();
  }

  /** Extracción sin reemplazo: una extracción de {@code random} por elemento, retirándolo del pool. */
  static List<String> takeRandom(List<String> source, int count, DoubleSupplier random) {
    var pool = new ArrayList<>(source);
    var selected = new ArrayList<String>();
    while (selected.size() < count && !pool.isEmpty()) {
      int index = Math.min((int) Math.floor(random.getAsDouble() * pool.size()), pool.size() - 1);
      selected.add(pool.remove(index));
    }
    return selected;
  }

  private static Pokemon choosePokemon(PokemonImpostorConfig config, GameContext context) {
    var pool = context.pokemon().forGenerations(config.generations());
    if (pool.isEmpty()) throw new EngineException("Las generaciones seleccionadas no contienen Pokémon.");
    return Randoms.randomItem(pool, context.random());
  }

  /** {@code { ...state.clues, [round]: roundClues }}: el {@code Record<number, …>} se reordena por clave. */
  private static Map<Integer, Map<String, ImpostorClue>> withRoundClues(PokemonImpostorState state, int round,
      Map<String, ImpostorClue> roundClues) {
    var clues = new TreeMap<>(state.clues());
    clues.put(round, roundClues);
    return clues;
  }

  /**
   * {@code clueOrder.every((id, index) => id === state.clueOrder[index])}: un índice fuera del orden anterior es
   * {@code undefined} en JS y no coincide.
   */
  private static boolean sameOrder(List<String> clueOrder, List<String> previous) {
    for (int index = 0; index < clueOrder.size(); index++) {
      if (index >= previous.size() || !clueOrder.get(index).equals(previous.get(index))) return false;
    }
    return true;
  }

  /** {@code ONE_WORD}: pistas de una sola palabra y {@link #ONE_WORD_CLUE_LAPS} vueltas de pistas antes de votar. */
  private static boolean oneWord(PokemonImpostorState state) {
    return state.config().mode() == PokemonImpostorMode.ONE_WORD;
  }

  /** Primera vuelta de pistas de una ronda (en Clásico, la única). */
  private static PokemonImpostorState beginCluePhase(PokemonImpostorState state, GameContext context) {
    return beginClueLap(state, context, oneWord(state) ? 1 : 0);
  }

  /**
   * Baraja a los vivos conectados (una extracción por jugador); si repite el orden anterior, lo rota uno. Cada vuelta
   * es una ronda de pistas propia ({@code roundNumber} + 1): así las pistas de las dos vueltas quedan en {@code clues}.
   * {@code lap} es 0 en Clásico.
   */
  private static PokemonImpostorState beginClueLap(PokemonImpostorState state, GameContext context, int lap) {
    int roundNumber = state.roundNumber() + 1;
    var connectedAliveIds = context.connectedRequiredPlayerIds(state.aliveIds());
    var clueOrder = takeRandom(connectedAliveIds, connectedAliveIds.size(), context.random());
    if (clueOrder.size() > 1 && sameOrder(clueOrder, state.clueOrder())) {
      var rotated = new ArrayList<>(clueOrder.subList(1, clueOrder.size()));
      rotated.add(clueOrder.getFirst());
      clueOrder = rotated;
    }
    return state.toBuilder()
        .phase(GamePhase.CLUE_PHASE)
        .clueLap(lap)
        .roundNumber(roundNumber)
        .clues(withRoundClues(state, roundNumber, Map.of()))
        .clueOrder(clueOrder)
        .currentClueTurnIndex(0)
        .votes(Map.of())
        .voteCandidateIds(state.aliveIds())
        .votingRound(0)
        .roundStartedAt(context.now())
        // Siempre con plazo: un orden vacío (nadie conectado) vence a la votación en vez de congelar la partida.
        .roundEndsAt(context.now() + state.config().clueSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastVoteResult(null)
        .eliminationReveal(null)
        .build();
  }

  /**
   * Cierra el turno actual (con {@code skippedStatus} si no dejó pista) y salta a los desconectados, marcándolos
   * {@code DISCONNECTED}; tras el último turno empieza la votación.
   */
  private static PokemonImpostorState advanceClueTurn(PokemonImpostorState state, GameContext context,
      @Nullable ClueStatus skippedStatus) {
    var roundClues = new LinkedHashMap<>(state.roundClues());
    var currentId = state.currentCluePlayerId();
    if (currentId != null && !currentId.isEmpty() && skippedStatus != null && !roundClues.containsKey(currentId)) {
      roundClues.put(currentId, ImpostorClue.skipped(skippedStatus));
    }
    int nextIndex = state.currentClueTurnIndex() + 1;
    while (nextIndex < state.clueOrder().size()) {
      var nextId = state.clueOrder().get(nextIndex);
      if (context.isPlayerRequired(nextId)) break;
      if (!roundClues.containsKey(nextId)) roundClues.put(nextId, ImpostorClue.skipped(ClueStatus.DISCONNECTED));
      nextIndex += 1;
    }
    var next = state.toBuilder()
        .clues(withRoundClues(state, state.roundNumber(), roundClues))
        .currentClueTurnIndex(nextIndex)
        .build();
    if (nextIndex >= state.clueOrder().size()) {
      if (oneWord(next) && next.clueLap() < ONE_WORD_CLUE_LAPS) return beginClueLap(next, context, next.clueLap() + 1);
      return beginVoting(next, context, next.aliveIds());
    }
    return next.toBuilder()
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().clueSeconds() * 1_000L)
        .build();
  }

  private static PokemonImpostorState beginVoting(PokemonImpostorState state, GameContext context,
      List<String> candidateIds) {
    return state.toBuilder()
        .phase(GamePhase.VOTING)
        .votes(Map.of())
        .voteCandidateIds(candidateIds)
        .votingRound(state.votingRound() + 1)
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().voteSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastVoteResult(null)
        .build();
  }

  /**
   * Recuento sobre los candidatos; los votos a «Saltar» van a {@code skipVotes}. «Saltar» gana si iguala o supera el
   * máximo (incluido el 0–0); más de un máximo es empate ({@code TIE}), o {@code DEADLOCK} en la revotación; uno solo
   * es expulsión.
   */
  private static PokemonImpostorState resolveVoting(PokemonImpostorState state, GameContext context) {
    if (state.phase() != GamePhase.VOTING) return state;
    var tallies = new LinkedHashMap<String, Integer>();
    for (var id : state.voteCandidateIds()) tallies.put(id, 0);
    int skipVotes = 0;
    for (var vote : state.votes().values()) {
      if (PokemonImpostorTypes.IMPOSTOR_SKIP_TARGET.equals(vote.targetId())) {
        skipVotes += 1;
      } else {
        tallies.put(vote.targetId(), tallies.getOrDefault(vote.targetId(), 0) + 1);
      }
    }
    int maximum = skipVotes;
    for (int count : tallies.values()) maximum = Math.max(maximum, count);
    int max = maximum;
    var tied = state.voteCandidateIds().stream().filter(id -> tallies.get(id) == max).toList();
    VoteResultKind kind = skipVotes == maximum ? VoteResultKind.SKIPPED
        : tied.size() > 1
            ? (state.votingRound() >= PokemonImpostorRules.IMPOSTOR_MAX_VOTING_ROUNDS ? VoteResultKind.DEADLOCK
                : VoteResultKind.TIE)
            : VoteResultKind.ELIMINATION;
    var result = new ImpostorVoteResult(
        kind,
        state.votes(),
        tallies,
        skipVotes,
        kind == VoteResultKind.TIE || kind == VoteResultKind.DEADLOCK ? tied : List.of(),
        kind == VoteResultKind.ELIMINATION ? tied.getFirst() : null);
    return state.toBuilder()
        .phase(GamePhase.VOTE_RESULTS)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + VOTE_RESULTS_MS)
        .lastVoteResult(result)
        .build();
  }

  /** Una ronda sin expulsión: la tercera seguida termina la partida con victoria de los impostores. */
  private static PokemonImpostorState afterNoElimination(PokemonImpostorState state, GameContext context) {
    int roundsWithoutElimination = state.roundsWithoutElimination() + 1;
    if (roundsWithoutElimination >= PokemonImpostorRules.IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION) {
      return finishGame(state.toBuilder()
          .roundsWithoutElimination(roundsWithoutElimination)
          .winnerTeam(ImpostorWinner.IMPOSTORS)
          .finishReason(ImpostorFinishReason.STALEMATE)
          .build());
    }
    return beginCluePhase(state.toBuilder().roundsWithoutElimination(roundsWithoutElimination).build(), context);
  }

  private static @Nullable ImpostorFinishReason eliminationFinishReason(@Nullable ImpostorWinner winnerTeam) {
    if (winnerTeam == ImpostorWinner.INNOCENTS) return ImpostorFinishReason.IMPOSTORS_ELIMINATED;
    if (winnerTeam == ImpostorWinner.IMPOSTORS) return ImpostorFinishReason.PARITY;
    return null;
  }

  private static PokemonImpostorState beginElimination(PokemonImpostorState state, GameContext context) {
    var playerId = state.lastVoteResult() == null ? null : state.lastVoteResult().eliminatedId();
    if (playerId == null || playerId.isEmpty()) return state;
    var aliveIds = state.aliveIds().stream().filter(id -> !id.equals(playerId)).toList();
    var eliminatedIds = new ArrayList<>(state.eliminatedIds());
    eliminatedIds.add(playerId);
    var winnerTeam = PokemonImpostorRules.impostorWinner(aliveIds, state.roles());
    return state.toBuilder()
        .phase(GamePhase.ELIMINATION)
        .aliveIds(aliveIds)
        .eliminatedIds(eliminatedIds)
        .spectatorIds(eliminatedIds)
        .roundsWithoutElimination(0)
        .eliminationReveal(new ImpostorEliminationReveal(playerId,
            Objects.requireNonNull(state.roles().get(playerId), "role")))
        .winnerTeam(winnerTeam)
        .finishReason(eliminationFinishReason(winnerTeam))
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + ELIMINATION_MS)
        .build();
  }

  private static PokemonImpostorState finishGame(PokemonImpostorState state) {
    return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
  }

  /** {@code value.trim().normalize('NFC')}. */
  static String normalizedClue(String value) {
    return Normalizer.normalize(JsStrings.trim(value), Normalizer.Form.NFC);
  }

  /** {@code context.now >= (deadline ?? 0)}: sin plazo, cualquier instante cuenta como vencido. */
  private static boolean pastOrMissing(long now, @Nullable Long deadline) {
    return now >= (deadline == null ? 0 : deadline);
  }

  @Override
  public PokemonImpostorState createInitialState(PokemonImpostorConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    if (config.impostorCount() * 2 >= context.players().size()) {
      throw new EngineException("Debe haber más inocentes que impostores al comenzar.");
    }
    var secretPokemon = choosePokemon(config, context);
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var impostorIds = new HashSet<>(takeRandom(playerIds, config.impostorCount(), context.random()));
    var roles = new LinkedHashMap<String, ImpostorRole>();
    var playerStats = new LinkedHashMap<String, ImpostorPlayerStats>();
    for (var id : playerIds) {
      roles.put(id, impostorIds.contains(id) ? ImpostorRole.IMPOSTOR : ImpostorRole.INNOCENT);
      playerStats.put(id, ImpostorPlayerStats.ZERO);
    }
    return PokemonImpostorState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .roles(roles)
        .secretPokemonId(secretPokemon.id())
        .aliveIds(playerIds)
        .roundNumber(0)
        .currentClueTurnIndex(0)
        .votingRound(0)
        .roundsWithoutElimination(0)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public PokemonImpostorState start(PokemonImpostorState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return state.toBuilder()
        .phase(GamePhase.ROLE_REVEAL)
        .roundStartedAt(context.now())
        .nextTransitionAt(context.now() + ROLE_REVEAL_MS)
        .build();
  }

  @Override
  public GameActionResult<PokemonImpostorState> handleAction(PokemonImpostorState state, String playerId,
      PokemonImpostorAction action, GameContext context) {
    if (!state.playerIds().contains(playerId)) return GameActionResult.reject(state, "No participas en esta partida.");
    if (!state.aliveIds().contains(playerId)) return GameActionResult.reject(state, "Estás observando la partida.");
    if (!context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    return switch (action) {
      case PokemonImpostorAction.GuessPokemon guess -> guessPokemon(state, playerId, guess.pokemonId(), context);
      case PokemonImpostorAction.SubmitClue clue -> submitClue(state, playerId, clue.text(), context);
      case PokemonImpostorAction.Vote vote -> vote(state, playerId, vote.targetId(), context);
    };
  }

  /** Un único intento por impostor; acertar termina la partida con victoria de los impostores. */
  private static GameActionResult<PokemonImpostorState> guessPokemon(PokemonImpostorState state, String playerId,
      String pokemonId, GameContext context) {
    if (state.phase() != GamePhase.CLUE_PHASE) {
      return GameActionResult.reject(state, "Solo puedes adivinar durante la fase de pistas.");
    }
    if (state.roles().get(playerId) != ImpostorRole.IMPOSTOR) {
      return GameActionResult.reject(state, "Solo los impostores pueden intentar adivinar.");
    }
    if (pastOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(advanceClueTurn(state, context, ClueStatus.TIMEOUT),
          "El tiempo para adivinar ha terminado.");
    }
    if (state.guessAttempts().containsKey(playerId)) {
      return GameActionResult.reject(state, "Ya has utilizado tu intento.");
    }
    var pokemon = context.pokemon().byId(pokemonId);
    if (pokemon.isEmpty() || !state.config().generations().contains(pokemon.get().generation())) {
      return GameActionResult.reject(state, "Pokémon fuera del pool configurado.");
    }
    boolean correct = pokemon.get().id().equals(state.secretPokemonId());
    var guessAttempts = new LinkedHashMap<>(state.guessAttempts());
    guessAttempts.put(playerId, new ImpostorGuess(pokemon.get().id(), correct, context.now()));
    return GameActionResult.accept(state.toBuilder()
        .guessAttempts(guessAttempts)
        .winnerTeam(correct ? ImpostorWinner.IMPOSTORS : state.winnerTeam())
        .finishReason(correct ? ImpostorFinishReason.GUESS : state.finishReason())
        .phase(correct ? GamePhase.GAME_RESULTS : state.phase())
        .roundEndsAt(correct ? null : state.roundEndsAt())
        .nextTransitionAt(correct ? null : state.nextTransitionAt())
        .build());
  }

  private static GameActionResult<PokemonImpostorState> submitClue(PokemonImpostorState state, String playerId,
      String rawText, GameContext context) {
    if (state.phase() != GamePhase.CLUE_PHASE) {
      return GameActionResult.reject(state, "No estamos en la fase de pistas.");
    }
    if (pastOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo para enviar pistas ha terminado.");
    }
    if (!playerId.equals(state.currentCluePlayerId())) {
      return GameActionResult.reject(state, "No es tu turno de pista.");
    }
    var roundClues = state.roundClues();
    if (roundClues.containsKey(playerId)) return GameActionResult.reject(state, "Tu pista ya está bloqueada.");
    var text = normalizedClue(rawText);
    if (text.isEmpty()) return GameActionResult.reject(state, "Escribe una pista.");
    if (oneWord(state) && text.chars().anyMatch(code -> JsStrings.isJsWhitespace((char) code))) {
      return GameActionResult.reject(state, "La pista debe ser una sola palabra.");
    }
    if (text.codePointCount(0, text.length()) > MAX_CLUE_CODE_POINTS) {
      return GameActionResult.reject(state, "La pista no puede superar 25 caracteres.");
    }
    var nextRoundClues = new LinkedHashMap<>(roundClues);
    nextRoundClues.put(playerId, ImpostorClue.submitted(text, context.now()));
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, Objects.requireNonNull(state.playerStats().get(playerId), "stats").afterClue());
    var next = state.toBuilder()
        .clues(withRoundClues(state, state.roundNumber(), nextRoundClues))
        .playerStats(playerStats)
        .build();
    return GameActionResult.accept(advanceClueTurn(next, context, null));
  }

  private static GameActionResult<PokemonImpostorState> vote(PokemonImpostorState state, String playerId,
      String targetId, GameContext context) {
    if (state.phase() != GamePhase.VOTING) return GameActionResult.reject(state, "No estamos en la fase de votación.");
    if (pastOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo para votar ha terminado.");
    }
    if (state.votes().containsKey(playerId)) return GameActionResult.reject(state, "Tu voto ya está bloqueado.");
    if (targetId.equals(playerId)) return GameActionResult.reject(state, "No puedes votarte a ti mismo.");
    if (!PokemonImpostorTypes.IMPOSTOR_SKIP_TARGET.equals(targetId)
        && (!state.voteCandidateIds().contains(targetId) || !state.aliveIds().contains(targetId))) {
      return GameActionResult.reject(state, "Ese jugador no es candidato.");
    }
    var votes = new LinkedHashMap<>(state.votes());
    votes.put(playerId, new ImpostorVote(targetId, context.now()));
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, Objects.requireNonNull(state.playerStats().get(playerId), "stats").afterVote());
    var next = state.toBuilder().votes(votes).playerStats(playerStats).build();
    return GameActionResult.accept(Timing.resolveWhenRequiredPlayersComplete(next, context, next.aliveIds(),
        id -> next.votes().containsKey(id), PokemonImpostorEngine::resolveVoting, GamePhase.VOTING));
  }

  @Override
  public PokemonImpostorState handleTimeout(PokemonImpostorState state, GameContext context) {
    long now = context.now();
    if (state.phase() == GamePhase.ROLE_REVEAL && Timing.deadlineReached(now, state.nextTransitionAt())) {
      return beginCluePhase(state, context);
    }
    if (state.phase() == GamePhase.CLUE_PHASE && Timing.deadlineReached(now, state.roundEndsAt())) {
      return advanceClueTurn(state, context, ClueStatus.TIMEOUT);
    }
    if (state.phase() == GamePhase.VOTING && Timing.deadlineReached(now, state.roundEndsAt())) {
      return resolveVoting(state, context);
    }
    if (state.phase() == GamePhase.VOTE_RESULTS && Timing.deadlineReached(now, state.nextTransitionAt())) {
      var kind = state.lastVoteResult() == null ? null : state.lastVoteResult().kind();
      if (kind == VoteResultKind.TIE) return beginVoting(state, context, state.lastVoteResult().tiedIds());
      if (kind == VoteResultKind.SKIPPED || kind == VoteResultKind.DEADLOCK) return afterNoElimination(state, context);
      return beginElimination(state, context);
    }
    if (state.phase() == GamePhase.ELIMINATION && Timing.deadlineReached(now, state.nextTransitionAt())) {
      return state.winnerTeam() != null ? finishGame(state) : beginCluePhase(state, context);
    }
    return state;
  }

  /**
   * Con el orden de pistas vacío (nadie conectado al empezar la ronda), la primera presencia con vivos conectados lo
   * baraja; si el jugador del turno se desconecta, su turno se salta. En la votación, la presencia cierra el recuento
   * cuando todos los conectados han votado.
   */
  @Override
  public PokemonImpostorState handlePresenceChange(PokemonImpostorState state, GameContext context) {
    if (state.phase() == GamePhase.CLUE_PHASE) {
      if (state.clueOrder().isEmpty()) {
        var connectedAliveIds = context.connectedRequiredPlayerIds(state.aliveIds());
        if (!connectedAliveIds.isEmpty()) {
          return state.toBuilder()
              .clueOrder(takeRandom(connectedAliveIds, connectedAliveIds.size(), context.random()))
              .currentClueTurnIndex(0)
              .roundStartedAt(context.now())
              .roundEndsAt(context.now() + state.config().clueSeconds() * 1_000L)
              .build();
        }
      }
      var currentId = state.currentCluePlayerId();
      if (currentId != null && !currentId.isEmpty() && !context.isPlayerRequired(currentId)) {
        return advanceClueTurn(state, context, ClueStatus.DISCONNECTED);
      }
    }
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.aliveIds(),
        id -> state.votes().containsKey(id), PokemonImpostorEngine::resolveVoting, GamePhase.VOTING);
  }

  @Override
  public PokemonImpostorPublicState getPublicState(PokemonImpostorState state, GameContext context) {
    boolean cluePhase = state.phase() == GamePhase.CLUE_PHASE;
    var roundClues = state.clues().get(state.roundNumber());
    var cluePendingIds = !cluePhase ? List.<String>of()
        : state.clueOrder().subList(Math.min(state.currentClueTurnIndex(), state.clueOrder().size()),
            state.clueOrder().size()).stream()
            .filter(id -> roundClues == null || !roundClues.containsKey(id))
            .toList();
    boolean showsVoteResult = state.phase() == GamePhase.VOTE_RESULTS || state.phase() == GamePhase.ELIMINATION;
    boolean showsReveal = state.phase() == GamePhase.ELIMINATION || state.phase() == GamePhase.GAME_RESULTS;
    return PokemonImpostorPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .mode(state.config().mode())
        .clueLap(oneWord(state) && state.clueLap() > 0 ? state.clueLap() : null)
        .playerIds(state.playerIds())
        .aliveIds(state.aliveIds())
        .eliminatedIds(state.eliminatedIds())
        .spectatorIds(state.spectatorIds())
        .roundNumber(state.roundNumber())
        .clues(state.clues())
        .clueOrder(state.clueOrder())
        .currentClueTurnIndex(state.currentClueTurnIndex())
        .currentCluePlayerId(cluePhase ? state.currentCluePlayerId() : null)
        .cluePendingIds(cluePendingIds)
        .voteCompletedIds(state.phase() == GamePhase.VOTING ? List.copyOf(state.votes().keySet()) : List.of())
        .voteCandidateIds(state.voteCandidateIds())
        .votingRound(state.votingRound())
        .roundStartedAt(state.roundStartedAt())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .lastVoteResult(showsVoteResult ? state.lastVoteResult() : null)
        .eliminationReveal(showsReveal ? state.eliminationReveal() : null)
        .winnerTeam(state.winnerTeam())
        .finishReason(state.finishReason())
        .results(state.phase() == GamePhase.GAME_RESULTS ? PokemonImpostorRules.buildPokemonImpostorResults(state)
            : null)
        .build();
  }

  /**
   * El Pokémon secreto solo lo ven los inocentes, los expulsados y todos al terminar; los roles, los expulsados y
   * todos al terminar. El impostor vivo recibe {@code secretPokemon: null}.
   */
  @Override
  public Object getPlayerState(PokemonImpostorState state, String playerId, GameContext context) {
    var role = state.roles().get(playerId);
    boolean eliminated = state.eliminatedIds().contains(playerId);
    boolean finished = state.phase() == GamePhase.GAME_RESULTS;
    boolean maySeeSecrets = role == ImpostorRole.INNOCENT || eliminated || finished;
    var pokemon = maySeeSecrets ? context.pokemon().byId(state.secretPokemonId()) : Optional.<Pokemon>empty();
    boolean alive = state.aliveIds().contains(playerId);
    boolean required = context.isPlayerRequired(playerId);
    var roundClues = state.clues().get(state.roundNumber());
    var ownClue = roundClues == null ? null : roundClues.get(playerId);
    var guess = state.guessAttempts().get(playerId);
    var ownVote = state.votes().get(playerId);
    return PokemonImpostorPlayerState.builder()
        .role(role)
        .secretPokemon(pokemon.map(found -> new SecretPokemon(found.name(), found.sprite())).orElse(null))
        .revealedRoles(eliminated || finished ? state.roles() : null)
        .alive(alive)
        .canSubmitClue(state.phase() == GamePhase.CLUE_PHASE && alive && required
            && playerId.equals(state.currentCluePlayerId()) && ownClue == null)
        .ownClue(ownClue)
        .canGuessPokemon(state.phase() == GamePhase.CLUE_PHASE && alive && required && role == ImpostorRole.IMPOSTOR
            && guess == null)
        .guessUsed(guess != null)
        .guessCorrect(guess == null ? null : guess.correct())
        .canVote(state.phase() == GamePhase.VOTING && alive && required && ownVote == null)
        .ownVote(ownVote)
        .build();
  }

  @Override
  public GameLifecycle getLifecycle(PokemonImpostorState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .turnIndex(state.currentClueTurnIndex())
        .voteRoundNumber(state.votingRound())
        .spectatorIds(state.spectatorIds())
        .build();
  }

  @Override
  public boolean isFinished(PokemonImpostorState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonImpostorState state) {
    return PokemonImpostorRules.buildPokemonImpostorResults(state);
  }
}
