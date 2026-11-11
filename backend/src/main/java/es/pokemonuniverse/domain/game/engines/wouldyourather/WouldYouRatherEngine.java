package es.pokemonuniverse.domain.game.engines.wouldyourather;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import es.pokemonuniverse.domain.game.engine.infra.PromptDeck;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherAction;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherBallot;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherOption;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherPlayerRoundResult;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherPlayerState;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherPrompt;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherPublicState;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherRoundResult;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherState;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherStats;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal del TS que antes estaba en {@code would-you-rather/server.ts}. */
public final class WouldYouRatherEngine implements
    GameEngine<WouldYouRatherConfig, WouldYouRatherState, WouldYouRatherAction, WouldYouRatherPublicState> {

  public static final String ID = "would-you-rather";
  public static final long REVEAL_MS = 8_000;

  /** {@code { id: '', optionA: '', optionB: '' }} cuando no hay pareja actual. */
  private static final WouldYouRatherPromptPair NO_PROMPT = new WouldYouRatherPromptPair("", "", "");

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public WouldYouRatherEngine(GameManifest manifest) {
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
  public WouldYouRatherConfig parseConfig(JsonNode raw) {
    return WouldYouRatherConfig.parse(raw);
  }

  @Override
  public WouldYouRatherAction parseAction(JsonNode raw) {
    return WouldYouRatherAction.parse(raw);
  }

  @Override
  public WouldYouRatherConfig defaultConfig() {
    return WouldYouRatherConfig.defaults();
  }

  /** Oficiales y del host, estas con el id prefijado ({@code { ...prompt, id }} conserva la posición de {@code id}). */
  private static List<WouldYouRatherPromptPair> promptPool(WouldYouRatherConfig config, GameContext context) {
    var pool = new ArrayList<WouldYouRatherPromptPair>();
    if (config.promptSource() != PromptSource.CUSTOM) pool.addAll(WouldYouRatherPrompts.OFFICIAL);
    if (config.promptSource() != PromptSource.OFFICIAL) {
      for (var prompt : context.hostWouldYouRatherPrompts()) {
        pool.add(new WouldYouRatherPromptPair("would-you-rather-custom-" + prompt.id(), prompt.optionA(),
            prompt.optionB()));
      }
    }
    return pool;
  }

  private static PromptDeck.Choice choosePrompt(WouldYouRatherState state, GameContext context) {
    return PromptDeck.choose(state.promptPool(), state.usedPromptIds(), WouldYouRatherPromptPair::id, context.random());
  }

  private static WouldYouRatherPromptPair currentPrompt(WouldYouRatherState state) {
    return state.promptPool().stream()
        .filter(prompt -> prompt.id().equals(state.currentPromptId()))
        .findFirst()
        .orElse(NO_PROMPT);
  }

  private static WouldYouRatherState beginRound(WouldYouRatherState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    var selected = choosePrompt(state, context);
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .currentPromptId(selected.promptId())
        .usedPromptIds(selected.usedPromptIds())
        .ballots(Map.of())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static WouldYouRatherState resolveRound(WouldYouRatherState state, GameContext context) {
    int totalA = 0;
    int totalB = 0;
    for (var ballot : state.ballots().values()) {
      if (ballot.preference() == WouldYouRatherOption.A) totalA += 1;
      else totalB += 1;
    }
    var totals = new LinkedHashMap<String, Integer>();
    totals.put("A", totalA);
    totals.put("B", totalB);
    WouldYouRatherOption majority = totalA == totalB ? null
        : totalA > totalB ? WouldYouRatherOption.A : WouldYouRatherOption.B;
    var players = state.ballots().entrySet().stream()
        .map(entry -> WouldYouRatherPlayerRoundResult.scored(entry.getKey(), entry.getValue(), majority))
        .toList();
    var resultsByPlayer = new LinkedHashMap<String, WouldYouRatherPlayerRoundResult>();
    for (var player : players) resultsByPlayer.put(player.playerId(), player);
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, WouldYouRatherStats>();
    for (var playerId : state.playerIds()) {
      var result = resultsByPlayer.get(playerId);
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + (result == null ? 0 : result.totalPoints()));
      playerStats.put(playerId, WouldYouRatherRules.statsOf(state, playerId).afterRound(result));
    }
    var lastRound = new WouldYouRatherRoundResult(WouldYouRatherPrompt.of(currentPrompt(state)), totals, majority,
        players, state.playerIds().stream().filter(playerId -> !state.ballots().containsKey(playerId)).toList());
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  @Override
  public WouldYouRatherState createInitialState(WouldYouRatherConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Would You Rather necesita al menos 3 jugadores.");
    }
    var prompts = promptPool(config, context);
    if (prompts.isEmpty()) throw new EngineException("No hay parejas activas para Would You Rather.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, WouldYouRatherStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, WouldYouRatherStats.ZERO);
    }
    return WouldYouRatherState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .promptPool(prompts)
        .usedPromptIds(List.of())
        .roundNumber(0)
        .currentPromptId(null)
        .ballots(Map.of())
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public WouldYouRatherState start(WouldYouRatherState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<WouldYouRatherState> handleAction(WouldYouRatherState state, String playerId,
      WouldYouRatherAction action, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta ronda.");
    }
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La votación ya ha terminado.");
    boolean timeUp = Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt());
    if (timeUp) return GameActionResult.reject(state, "El tiempo ha terminado.");
    if (state.ballots().containsKey(playerId)) return GameActionResult.reject(state, "Tu papeleta ya está bloqueada.");
    var ballots = new LinkedHashMap<>(state.ballots());
    ballots.put(playerId, new WouldYouRatherBallot(action.preference(), action.prediction()));
    var next = state.toBuilder().ballots(ballots).build();
    return GameActionResult.accept(Timing.resolveWhenRequiredPlayersComplete(next, context, next.playerIds(),
        id -> next.ballots().containsKey(id), WouldYouRatherEngine::resolveRound));
  }

  @Override
  public WouldYouRatherState handleTimeout(WouldYouRatherState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return resolveRound(state, context);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginRound(state, context);
    }
    return state;
  }

  @Override
  public WouldYouRatherState handlePresenceChange(WouldYouRatherState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.ballots().containsKey(id), WouldYouRatherEngine::resolveRound);
  }

  @Override
  public WouldYouRatherPublicState getPublicState(WouldYouRatherState state, GameContext context) {
    return new WouldYouRatherPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        WouldYouRatherPrompt.of(currentPrompt(state)), state.playerIds(), new ArrayList<>(state.ballots().keySet()),
        state.scores(), state.roundEndsAt(), state.nextTransitionAt(),
        state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? WouldYouRatherRules.buildWouldYouRatherResults(state) : null);
  }

  @Override
  public WouldYouRatherPlayerState getPlayerState(WouldYouRatherState state, String playerId, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return WouldYouRatherPlayerState.SPECTATOR;
    }
    var ballot = state.ballots().get(playerId);
    return new WouldYouRatherPlayerState("PLAYER", state.phase() == GamePhase.ROUND_ACTIVE && ballot == null, ballot);
  }

  @Override
  public GameLifecycle getLifecycle(WouldYouRatherState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(WouldYouRatherState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(WouldYouRatherState state) {
    return WouldYouRatherRules.buildWouldYouRatherResults(state);
  }
}
