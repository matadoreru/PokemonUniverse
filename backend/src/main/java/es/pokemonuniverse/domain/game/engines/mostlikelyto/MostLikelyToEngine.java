package es.pokemonuniverse.domain.game.engines.mostlikelyto;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.RunoffVoting;
import es.pokemonuniverse.domain.game.engine.infra.PromptDeck;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToAction;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToPlayerState;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToPokemon;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToPublicState;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToResultAnswer;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToRevealedAnswer;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToRoundResult;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToState;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToStats;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToVoteRound;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal del TS que antes estaba en {@code most-likely-to/server.ts}. */
public final class MostLikelyToEngine
    implements GameEngine<MostLikelyToConfig, MostLikelyToState, MostLikelyToAction, MostLikelyToPublicState> {

  public static final String ID = "most-likely-to";
  public static final long REVEAL_MS = 8_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public MostLikelyToEngine(GameManifest manifest) {
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
  public MostLikelyToConfig parseConfig(JsonNode raw) {
    return MostLikelyToConfig.parse(raw);
  }

  @Override
  public MostLikelyToAction parseAction(JsonNode raw) {
    return MostLikelyToAction.parse(raw);
  }

  @Override
  public MostLikelyToConfig defaultConfig() {
    return MostLikelyToConfig.defaults();
  }

  private static MostLikelyToPokemon summary(Pokemon pokemon) {
    return new MostLikelyToPokemon(pokemon.id(), pokemon.name(), pokemon.sprite());
  }

  /** Oficiales y del host, estas con el id prefijado. */
  private static List<SubjectiveCategory> promptPool(MostLikelyToConfig config, GameContext context) {
    var pool = new ArrayList<SubjectiveCategory>();
    if (config.promptSource() != PromptSource.CUSTOM) pool.addAll(MostLikelyToPrompts.OFFICIAL);
    if (config.promptSource() != PromptSource.OFFICIAL) {
      for (var prompt : context.hostCustomCategories()) {
        pool.add(new SubjectiveCategory("most-likely-to-custom-" + prompt.id(), prompt.text()));
      }
    }
    return pool;
  }

  private static PromptDeck.Choice choosePrompt(MostLikelyToState state, GameContext context) {
    return PromptDeck.choose(state.promptPool(), state.usedPromptIds(), SubjectiveCategory::id, context.random());
  }

  private static String promptText(MostLikelyToState state) {
    return state.promptPool().stream()
        .filter(prompt -> prompt.id().equals(state.currentPromptId()))
        .findFirst()
        .map(SubjectiveCategory::text)
        .orElse("");
  }

  private static MostLikelyToState beginRound(MostLikelyToState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    var prompt = choosePrompt(state, context);
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .currentPromptId(prompt.promptId())
        .usedPromptIds(prompt.usedPromptIds())
        .selections(Map.of())
        .votes(Map.of())
        .voteCandidates(List.of())
        .voteRoundNumber(1)
        .voteHistory(List.of())
        .roundEndsAt(context.now() + state.config().selectionSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  /** Cualquier candidato distinto del propio votante se puede votar. */
  private static List<String> eligibleVoterIds(MostLikelyToState state, GameContext context) {
    return RunoffVoting.eligibleRunoffVoterIds(state.playerIds(), state.voteCandidates(), context::isPlayerRequired,
        (playerId, candidateId) -> !candidateId.equals(playerId));
  }

  private static boolean allEligibleVoted(MostLikelyToState state, GameContext context) {
    return RunoffVoting.allEligibleRunoffVotersCompleted(eligibleVoterIds(state, context), state.votes());
  }

  private static MostLikelyToVoteRound voteRecord(MostLikelyToState state) {
    return MostLikelyToVoteRound.of(
        RunoffVoting.recordRunoffVoteRound(state.voteRoundNumber(), state.voteCandidates(), state.votes()));
  }

  private static MostLikelyToState finishRound(MostLikelyToState state, List<String> winnerIds,
      List<MostLikelyToVoteRound> voteHistory, GameContext context) {
    var winnerSet = new HashSet<>(winnerIds);
    Map<String, String> decisiveVotes = voteHistory.isEmpty() ? Map.of() : voteHistory.getLast().votes();
    var voteCounts = new LinkedHashMap<String, Integer>();
    for (var playerId : state.selections().keySet()) voteCounts.put(playerId, 0);
    for (var targetId : decisiveVotes.values()) {
      if (voteCounts.containsKey(targetId)) voteCounts.put(targetId, voteCounts.get(targetId) + 1);
    }
    var pointsAwarded = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      pointsAwarded.put(playerId, winnerSet.contains(playerId) ? MostLikelyToRules.WIN_POINTS : 0);
    }
    var scores = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + pointsAwarded.getOrDefault(playerId, 0));
    }
    var playerStats = new LinkedHashMap<String, MostLikelyToStats>();
    for (var playerId : state.playerIds()) {
      playerStats.put(playerId, MostLikelyToRules.statsOf(state, playerId).afterRound(
          state.selections().containsKey(playerId), voteCounts.getOrDefault(playerId, 0),
          winnerSet.contains(playerId), winnerIds.size(), pointsAwarded.getOrDefault(playerId, 0)));
    }
    var answers = state.selections().entrySet().stream()
        .map(entry -> new MostLikelyToResultAnswer(entry.getKey(), entry.getValue(),
            voteCounts.getOrDefault(entry.getKey(), 0), winnerSet.contains(entry.getKey())))
        .toList();
    var lastRound = new MostLikelyToRoundResult(promptText(state), answers, voteHistory, winnerIds, pointsAwarded);
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

  private static MostLikelyToState resolveVote(MostLikelyToState state, GameContext context) {
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
        .roundEndsAt(context.now() + state.config().votingSeconds() * 1_000L)
        .build();
  }

  /** Los candidatos son los que eligieron, en orden de primera elección; no consume {@code random}. */
  private static MostLikelyToState beginVoting(MostLikelyToState state, GameContext context) {
    var voteCandidates = List.copyOf(state.selections().keySet());
    var next = state.toBuilder()
        .phase(GamePhase.VOTING)
        .votes(Map.of())
        .voteCandidates(voteCandidates)
        .voteRoundNumber(1)
        .voteHistory(List.of())
        .roundEndsAt(context.now() + state.config().votingSeconds() * 1_000L)
        .build();
    if (voteCandidates.isEmpty()) return finishRound(next, List.of(), List.of(), context);
    if (voteCandidates.size() == 1) return finishRound(next, voteCandidates, List.of(), context);
    return next;
  }

  @Override
  public MostLikelyToState createInitialState(MostLikelyToConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Most Likely To necesita al menos 3 jugadores.");
    }
    var pool = context.pokemon().forGenerations(config.generations(), config.includeForms()).stream()
        .filter(pokemon -> JsStrings.truthy(pokemon.sprite()) && (config.includeForms() || pokemon.isDefault()))
        .toList();
    if (pool.isEmpty()) throw new EngineException("No hay Pokémon disponibles con esta configuración.");
    var prompts = promptPool(config, context);
    if (prompts.isEmpty()) throw new EngineException("No hay preguntas activas para Most Likely To.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, MostLikelyToStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, MostLikelyToStats.ZERO);
    }
    return MostLikelyToState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .pokemonPoolIds(pool.stream().map(Pokemon::id).toList())
        .promptPool(prompts)
        .roundNumber(0)
        .currentPromptId(null)
        .voteRoundNumber(1)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public MostLikelyToState start(MostLikelyToState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<MostLikelyToState> handleAction(MostLikelyToState state, String playerId,
      MostLikelyToAction action, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta ronda.");
    }
    boolean timeUp = Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt());
    if (action instanceof MostLikelyToAction.SelectPokemon select) {
      if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La selección ya ha terminado.");
      if (timeUp) return GameActionResult.reject(state, "El tiempo ha terminado.");
      var pokemon = context.pokemon().byId(select.pokemonId());
      if (pokemon.isEmpty() || !state.pokemonPoolIds().contains(pokemon.get().id())) {
        return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
      }
      var selections = new LinkedHashMap<>(state.selections());
      selections.put(playerId, summary(pokemon.get()));
      var next = state.toBuilder().selections(selections).build();
      return GameActionResult.accept(
          context.allConnectedRequiredCompleted(state.playerIds(), id -> next.selections().containsKey(id))
              ? beginVoting(next, context)
              : next);
    }
    var vote = (MostLikelyToAction.VoteAnswer) action;
    if (state.phase() != GamePhase.VOTING && state.phase() != GamePhase.REVOTE) {
      return GameActionResult.reject(state, "La votación no está activa.");
    }
    if (timeUp) return GameActionResult.reject(state, "El tiempo de votación ha terminado.");
    if (vote.playerId().equals(playerId)) return GameActionResult.reject(state, "No puedes votar tu propia respuesta.");
    if (!state.voteCandidates().contains(vote.playerId())) {
      return GameActionResult.reject(state, "Esa respuesta no es candidata en esta votación.");
    }
    if (JsStrings.truthy(state.votes().get(playerId))) return GameActionResult.reject(state, "Tu voto ya está bloqueado.");
    var stats = MostLikelyToRules.statsOf(state, playerId);
    var votes = new LinkedHashMap<>(state.votes());
    votes.put(playerId, vote.playerId());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats.afterVote());
    var next = state.toBuilder().votes(votes).playerStats(playerStats).build();
    return GameActionResult.accept(allEligibleVoted(next, context) ? resolveVote(next, context) : next);
  }

  @Override
  public MostLikelyToState handleTimeout(MostLikelyToState state, GameContext context) {
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
  public MostLikelyToState handlePresenceChange(MostLikelyToState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE
        && context.allConnectedRequiredCompleted(state.playerIds(), id -> state.selections().containsKey(id))) {
      return beginVoting(state, context);
    }
    if ((state.phase() == GamePhase.VOTING || state.phase() == GamePhase.REVOTE) && allEligibleVoted(state, context)) {
      return resolveVote(state, context);
    }
    return state;
  }

  @Override
  public MostLikelyToPublicState getPublicState(MostLikelyToState state, GameContext context) {
    boolean revealAnswers = state.phase() == GamePhase.VOTING || state.phase() == GamePhase.REVOTE;
    var revealedAnswers = revealAnswers
        ? state.selections().entrySet().stream()
            .map(entry -> new MostLikelyToRevealedAnswer(entry.getKey(), entry.getValue()))
            .toList()
        : List.<MostLikelyToRevealedAnswer>of();
    return new MostLikelyToPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        promptText(state), state.playerIds(), new ArrayList<>(state.selections().keySet()), revealedAnswers,
        new ArrayList<>(state.votes().keySet()), state.voteCandidates(), state.voteRoundNumber(), state.scores(),
        state.roundEndsAt(), state.nextTransitionAt(),
        state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? MostLikelyToRules.buildMostLikelyToResults(state) : null);
  }

  @Override
  public MostLikelyToPlayerState getPlayerState(MostLikelyToState state, String playerId, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return MostLikelyToPlayerState.SPECTATOR;
    }
    boolean voting = state.phase() == GamePhase.VOTING || state.phase() == GamePhase.REVOTE;
    return new MostLikelyToPlayerState(
        "PLAYER",
        state.phase() == GamePhase.ROUND_ACTIVE,
        state.selections().get(playerId),
        voting && !JsStrings.truthy(state.votes().get(playerId))
            && state.voteCandidates().stream().anyMatch(candidateId -> !candidateId.equals(playerId)),
        state.votes().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(MostLikelyToState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundNumber(state.roundNumber())
        .voteRoundNumber(state.voteRoundNumber())
        .build();
  }

  @Override
  public boolean isFinished(MostLikelyToState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(MostLikelyToState state) {
    return MostLikelyToRules.buildMostLikelyToResults(state);
  }
}
