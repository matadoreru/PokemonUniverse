package es.pokemonuniverse.domain.game.engines.pokemonredflag;

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
import es.pokemonuniverse.domain.game.engine.infra.RunoffVoting;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagConfig.PokemonRedFlagMode;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonFlagMode;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagAction;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagAnswer;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagAnswerView;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagPokemon;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagPublicState;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagResultAnswer;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagRoundResult;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagState;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagStats;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagVoteRound;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal del TS que antes estaba en {@code pokemon-red-flag/server.ts}. */
public final class PokemonRedFlagEngine
    implements GameEngine<PokemonRedFlagConfig, PokemonRedFlagState, PokemonRedFlagAction, PokemonRedFlagPublicState> {

  public static final String ID = "pokemon-red-flag";
  public static final long REVEAL_MS = 8_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonRedFlagEngine(GameManifest manifest) {
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
  public PokemonRedFlagConfig parseConfig(JsonNode raw) {
    return PokemonRedFlagConfig.parse(raw);
  }

  @Override
  public PokemonRedFlagAction parseAction(JsonNode raw) {
    return PokemonRedFlagAction.parse(raw);
  }

  @Override
  public PokemonRedFlagConfig defaultConfig() {
    return PokemonRedFlagConfig.defaults();
  }

  private static PokemonRedFlagPokemon summary(Pokemon pokemon) {
    return new PokemonRedFlagPokemon(pokemon.id(), pokemon.name(), pokemon.sprite());
  }

  /** {@code Boolean(state.answers[state.answerSlots[playerId]!])}. */
  private static boolean hasAnswer(PokemonRedFlagState state, String playerId) {
    var answerId = state.answerSlots().get(playerId);
    return answerId != null && state.answers().containsKey(answerId);
  }

  /** Consume {@code random} al barajar los huecos (una extracción por jugador menos uno). */
  private static Map<String, String> answerSlots(List<String> playerIds, int roundNumber, GameContext context) {
    var ids = new ArrayList<String>();
    for (int index = 0; index < playerIds.size(); index++) ids.add("rf-" + roundNumber + "-" + (index + 1));
    var opaqueIds = Randoms.shuffled(ids, context.random());
    var slots = new LinkedHashMap<String, String>();
    for (int index = 0; index < playerIds.size(); index++) slots.put(playerIds.get(index), opaqueIds.get(index));
    return slots;
  }

  /** Con {@code MIXED} consume {@code random} para el modo antes de barajar los huecos. */
  private static PokemonRedFlagState beginRound(PokemonRedFlagState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    int roundNumber = state.roundNumber() + 1;
    var pokemonId = state.pokemonDeckIds().get((roundNumber - 1) % state.pokemonDeckIds().size());
    var pokemon = context.pokemon().byId(pokemonId)
        .orElseThrow(() -> new EngineException("Pokémon desconocido: " + pokemonId));
    var flagMode = state.config().mode() == PokemonRedFlagMode.MIXED
        ? (context.random().getAsDouble() < .5 ? PokemonFlagMode.RED : PokemonFlagMode.GREEN)
        : PokemonFlagMode.valueOf(state.config().mode().name());
    if (context.preloadImage() != null) context.preloadImage().accept(pokemon.sprite());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(roundNumber)
        .currentPokemon(summary(pokemon))
        .flagMode(flagMode)
        .answerSlots(answerSlots(state.playerIds(), roundNumber, context))
        .drafts(Map.of())
        .answers(Map.of())
        .answerOrder(List.of())
        .votes(Map.of())
        .voteCandidates(List.of())
        .voteRoundNumber(1)
        .voteHistory(List.of())
        .roundEndsAt(context.now() + state.config().phaseSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  /** Una respuesta sin entrada ({@code answers[answerId]?.authorId}) se puede votar. */
  private static List<String> eligibleVoterIds(PokemonRedFlagState state, GameContext context) {
    return RunoffVoting.eligibleRunoffVoterIds(state.playerIds(), state.voteCandidates(), context::isPlayerRequired,
        (playerId, answerId) -> {
          var answer = state.answers().get(answerId);
          return answer == null || !answer.authorId().equals(playerId);
        });
  }

  private static boolean allEligibleVoted(PokemonRedFlagState state, GameContext context) {
    return RunoffVoting.allEligibleRunoffVotersCompleted(eligibleVoterIds(state, context), state.votes());
  }

  private static PokemonRedFlagVoteRound voteRecord(PokemonRedFlagState state) {
    return PokemonRedFlagVoteRound.of(
        RunoffVoting.recordRunoffVoteRound(state.voteRoundNumber(), state.voteCandidates(), state.votes()));
  }

  private static PokemonRedFlagState finishRound(PokemonRedFlagState state, List<String> winningAnswerIds,
      List<PokemonRedFlagVoteRound> voteHistory, GameContext context) {
    var winnerIds = winningAnswerIds.stream()
        .map(answerId -> state.answers().get(answerId))
        .filter(Objects::nonNull)
        .map(PokemonRedFlagAnswer::authorId)
        .filter(JsStrings::truthy)
        .toList();
    var winnerSet = new HashSet<>(winnerIds);
    Map<String, String> decisiveVotes = voteHistory.isEmpty() ? Map.of() : voteHistory.getLast().votes();
    var voteCounts = new LinkedHashMap<String, Integer>();
    for (var answerId : state.answers().keySet()) voteCounts.put(answerId, 0);
    for (var answerId : decisiveVotes.values()) {
      if (voteCounts.containsKey(answerId)) voteCounts.put(answerId, voteCounts.get(answerId) + 1);
    }
    var pointsAwarded = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      pointsAwarded.put(playerId, winnerSet.contains(playerId) ? PokemonRedFlagRules.WIN_POINTS : 0);
    }
    var scores = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + pointsAwarded.getOrDefault(playerId, 0));
    }
    var playerStats = new LinkedHashMap<String, PokemonRedFlagStats>();
    for (var playerId : state.playerIds()) {
      var current = PokemonRedFlagRules.statsOf(state, playerId);
      var ownAnswerId = state.answerSlots().get(playerId);
      boolean answered = JsStrings.truthy(ownAnswerId) && state.answers().containsKey(ownAnswerId);
      int receivedVotes = JsStrings.truthy(ownAnswerId) ? voteCounts.getOrDefault(ownAnswerId, 0) : 0;
      playerStats.put(playerId, current.afterRound(answered, receivedVotes, winnerSet.contains(playerId),
          winnerIds.size(), pointsAwarded.getOrDefault(playerId, 0)));
    }
    var winningSet = new HashSet<>(winningAnswerIds);
    var answers = state.answers().values().stream()
        .map(answer -> new PokemonRedFlagResultAnswer(answer.id(), answer.authorId(), answer.text(),
            voteCounts.getOrDefault(answer.id(), 0), winningSet.contains(answer.id())))
        .toList();
    var lastRound = new PokemonRedFlagRoundResult(state.flagMode(), Objects.requireNonNull(state.currentPokemon()),
        answers, voteHistory, winningAnswerIds, winnerIds, pointsAwarded,
        state.playerIds().stream().filter(playerId -> !hasAnswer(state, playerId)).toList());
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .voteHistory(voteHistory)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static PokemonRedFlagState resolveVote(PokemonRedFlagState state, GameContext context) {
    if (state.voteCandidates().isEmpty()) return finishRound(state, List.of(), state.voteHistory(), context);
    var recorded = voteRecord(state);
    var history = new ArrayList<>(state.voteHistory());
    history.add(recorded);
    var tied = RunoffVoting.leadingRunoffCandidateIds(state.voteCandidates(), state.votes());
    if (tied.size() == 1) return finishRound(state, tied, history, context);
    if (state.phase() == GamePhase.REVOTE) return finishRound(state, tied, history, context);
    return state.toBuilder()
        .phase(GamePhase.REVOTE)
        .votes(Map.of())
        .voteCandidates(tied)
        .voteRoundNumber(2)
        .voteHistory(history)
        .roundEndsAt(context.now() + state.config().phaseSeconds() * 1_000L)
        .build();
  }

  /**
   * Los borradores pendientes pasan a respuesta recortados con el {@code trim} de JS ({@link JsStrings#trim}: un
   * borrador puede traer cualquier espacio Unicode). Consume {@code random} al barajar el orden de las respuestas.
   */
  private static PokemonRedFlagState beginVoting(PokemonRedFlagState state, GameContext context) {
    var answers = new LinkedHashMap<>(state.answers());
    for (var playerId : state.playerIds()) {
      var draft = state.drafts().get(playerId);
      var text = draft == null ? null : JsStrings.trim(draft);
      var answerId = state.answerSlots().get(playerId);
      if (JsStrings.truthy(text) && JsStrings.truthy(answerId) && !answers.containsKey(answerId)) {
        answers.put(answerId, new PokemonRedFlagAnswer(answerId, playerId, text));
      }
    }
    var answerOrder = Randoms.shuffled(new ArrayList<>(answers.keySet()), context.random());
    var voteCandidates = List.copyOf(answerOrder);
    var next = state.toBuilder()
        .phase(GamePhase.VOTING)
        .answers(answers)
        .votes(Map.of())
        .answerOrder(answerOrder)
        .voteCandidates(voteCandidates)
        .voteRoundNumber(1)
        .voteHistory(List.of())
        .roundEndsAt(context.now() + state.config().phaseSeconds() * 1_000L)
        .build();
    if (voteCandidates.isEmpty()) return finishRound(next, List.of(), List.of(), context);
    if (voteCandidates.size() == 1 && eligibleVoterIds(next, context).isEmpty()) {
      return finishRound(next, voteCandidates, List.of(), context);
    }
    return next;
  }

  /** Consume {@code random} al barajar el mazo de Pokémon. */
  @Override
  public PokemonRedFlagState createInitialState(PokemonRedFlagConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("La Frase Pokémon necesita al menos 3 jugadores.");
    }
    var pool = context.pokemon().forGenerations(config.generations(), config.includeForms()).stream()
        .filter(pokemon -> JsStrings.truthy(pokemon.sprite()) && (config.includeForms() || pokemon.isDefault()))
        .toList();
    if (pool.isEmpty()) throw new EngineException("No hay Pokémon disponibles con esta configuración.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, PokemonRedFlagStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, PokemonRedFlagStats.ZERO);
    }
    return PokemonRedFlagState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .pokemonDeckIds(Randoms.shuffled(pool.stream().map(Pokemon::id).toList(), context.random()))
        .roundNumber(0)
        .flagMode(config.mode() == PokemonRedFlagMode.GREEN ? PokemonFlagMode.GREEN : PokemonFlagMode.RED)
        .voteRoundNumber(1)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public PokemonRedFlagState start(PokemonRedFlagState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<PokemonRedFlagState> handleAction(PokemonRedFlagState state, String playerId,
      PokemonRedFlagAction action, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta ronda.");
    }
    boolean timeUp = Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt());
    if (action instanceof PokemonRedFlagAction.UpdateDraft update) {
      if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La escritura ya ha terminado.");
      if (timeUp) return GameActionResult.reject(beginVoting(state, context), "El tiempo ha terminado.");
      var answerId = state.answerSlots().get(playerId);
      if (state.answers().containsKey(answerId)) return GameActionResult.reject(state, "Tu respuesta ya está bloqueada.");
      var drafts = new LinkedHashMap<>(state.drafts());
      drafts.put(playerId, update.text());
      return GameActionResult.accept(state.toBuilder().drafts(drafts).build());
    }
    if (action instanceof PokemonRedFlagAction.Submit submit) {
      if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La escritura ya ha terminado.");
      if (timeUp) return GameActionResult.reject(state, "El tiempo ha terminado.");
      var answerId = Objects.requireNonNull(state.answerSlots().get(playerId), "answerSlots");
      if (state.answers().containsKey(answerId)) return GameActionResult.reject(state, "Tu respuesta ya está bloqueada.");
      var drafts = new LinkedHashMap<>(state.drafts());
      drafts.put(playerId, submit.text());
      var answers = new LinkedHashMap<>(state.answers());
      answers.put(answerId, new PokemonRedFlagAnswer(answerId, playerId, submit.text()));
      var next = state.toBuilder().drafts(drafts).answers(answers).build();
      return GameActionResult.accept(Timing.resolveWhenRequiredPlayersComplete(next, context, next.playerIds(),
          id -> hasAnswer(next, id), PokemonRedFlagEngine::beginVoting));
    }
    var vote = (PokemonRedFlagAction.Vote) action;
    if (state.phase() != GamePhase.VOTING && state.phase() != GamePhase.REVOTE) {
      return GameActionResult.reject(state, "La votación no está activa.");
    }
    if (timeUp) return GameActionResult.reject(state, "El tiempo de votación ha terminado.");
    var answer = state.answers().get(vote.answerId());
    if (answer == null || !state.voteCandidates().contains(vote.answerId())) {
      return GameActionResult.reject(state, "Esa respuesta no es candidata.");
    }
    if (answer.authorId().equals(playerId)) return GameActionResult.reject(state, "No puedes votar tu propia respuesta.");
    if (JsStrings.truthy(state.votes().get(playerId))) return GameActionResult.reject(state, "Tu voto ya está bloqueado.");
    var stats = PokemonRedFlagRules.statsOf(state, playerId);
    var votes = new LinkedHashMap<>(state.votes());
    votes.put(playerId, vote.answerId());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats.afterVote());
    var next = state.toBuilder().votes(votes).playerStats(playerStats).build();
    return GameActionResult.accept(allEligibleVoted(next, context) ? resolveVote(next, context) : next);
  }

  @Override
  public PokemonRedFlagState handleTimeout(PokemonRedFlagState state, GameContext context) {
    boolean activeDeadline = Timing.deadlineReached(context.now(), state.roundEndsAt());
    if (state.phase() == GamePhase.ROUND_ACTIVE && activeDeadline) return beginVoting(state, context);
    if ((state.phase() == GamePhase.VOTING || state.phase() == GamePhase.REVOTE) && activeDeadline) {
      return resolveVote(state, context);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginRound(state, context);
    }
    return state;
  }

  @Override
  public PokemonRedFlagState handlePresenceChange(PokemonRedFlagState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE) {
      return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(), id -> hasAnswer(state, id),
          PokemonRedFlagEngine::beginVoting);
    }
    if ((state.phase() == GamePhase.VOTING || state.phase() == GamePhase.REVOTE) && allEligibleVoted(state, context)) {
      return resolveVote(state, context);
    }
    return state;
  }

  @Override
  public PokemonRedFlagPublicState getPublicState(PokemonRedFlagState state, GameContext context) {
    boolean voting = state.phase() == GamePhase.VOTING || state.phase() == GamePhase.REVOTE;
    var revealedAnswers = new ArrayList<PokemonRedFlagAnswerView>();
    if (voting) {
      for (var answerId : state.answerOrder()) {
        var answer = state.answers().get(answerId);
        if (answer != null) revealedAnswers.add(new PokemonRedFlagAnswerView(answer.id(), answer.text()));
      }
    }
    return new PokemonRedFlagPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        state.currentPokemon(), state.flagMode(), state.playerIds(),
        state.answers().values().stream().map(PokemonRedFlagAnswer::authorId).toList(), revealedAnswers,
        new ArrayList<>(state.votes().keySet()), state.voteCandidates(), state.voteRoundNumber(), state.scores(),
        state.roundEndsAt(), state.nextTransitionAt(),
        state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? PokemonRedFlagRules.buildPokemonRedFlagResults(state) : null);
  }

  @Override
  public PokemonRedFlagPlayerState getPlayerState(PokemonRedFlagState state, String playerId, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return PokemonRedFlagPlayerState.SPECTATOR;
    }
    var ownAnswerId = state.answerSlots().get(playerId);
    var ownAnswer = JsStrings.truthy(ownAnswerId) ? state.answers().get(ownAnswerId) : null;
    boolean voting = state.phase() == GamePhase.VOTING || state.phase() == GamePhase.REVOTE;
    return new PokemonRedFlagPlayerState(
        "PLAYER",
        state.phase() == GamePhase.ROUND_ACTIVE && ownAnswer == null,
        state.drafts().getOrDefault(playerId, ""),
        ownAnswer != null ? new PokemonRedFlagAnswerView(ownAnswer.id(), ownAnswer.text()) : null,
        voting && !JsStrings.truthy(state.votes().get(playerId))
            && state.voteCandidates().stream().anyMatch(answerId -> {
          var answer = state.answers().get(answerId);
          return answer == null || !answer.authorId().equals(playerId);
        }),
        state.votes().get(playerId),
        ownAnswerId);
  }

  @Override
  public GameLifecycle getLifecycle(PokemonRedFlagState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundNumber(state.roundNumber())
        .voteRoundNumber(state.voteRoundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokemonRedFlagState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonRedFlagState state) {
    return PokemonRedFlagRules.buildPokemonRedFlagResults(state);
  }
}
