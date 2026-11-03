package es.pokemonuniverse.domain.game.engines.higherlower;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerAnswerVisibility;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerAction;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerAnswer;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerChoice;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerOutcome;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerPlayerState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerPokemonView;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerPublicState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerRoundResult;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerStats;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code higher-lower/server.ts}. */
public final class HigherLowerEngine
    implements GameEngine<HigherLowerConfig, HigherLowerState, HigherLowerAction, HigherLowerPublicState> {

  public static final String ID = "higher-lower";
  private static final long REVEAL_MS = 3_000;

  private final GameManifest manifest;

  private static final TimedRoundStrategy<HigherLowerState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public HigherLowerState beginNext(HigherLowerState state, GameContext context) {
      return beginNextRound(state, context);
    }

    @Override
    public HigherLowerState resolveActive(HigherLowerState state, GameContext context) {
      return reveal(state, context);
    }

    @Override
    public HigherLowerState finish(HigherLowerState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(HigherLowerState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public HigherLowerEngine(GameManifest manifest) {
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
  public HigherLowerConfig parseConfig(JsonNode raw) {
    return HigherLowerConfig.parse(raw);
  }

  @Override
  public HigherLowerAction parseAction(JsonNode raw) {
    return HigherLowerAction.parse(raw);
  }

  @Override
  public HigherLowerConfig defaultConfig() {
    return HigherLowerConfig.defaults();
  }

  private static Pokemon pokemon(GameContext context, String id) {
    return context.pokemon().byId(id).orElseThrow(() -> new EngineException("Pokémon desconocido: " + id));
  }

  private static HigherLowerPokemonView pokemonView(Pokemon pokemon, @Nullable Integer value) {
    return new HigherLowerPokemonView(pokemon.id(), pokemon.name(), pokemon.sprite(), value);
  }

  /** Consume {@code random} dos veces: categoría y luego Pokémon. */
  private static HigherLowerState beginRound(HigherLowerState state, GameContext context) {
    var pool = context.pokemon().forGenerations(state.config().generations());
    var candidates = pool.stream().filter(entry -> !entry.id().equals(state.previousPokemonId())).toList();
    var previous = pokemon(context, state.previousPokemonId());
    var category = Randoms.randomItem(state.config().categories(), context.random());
    var current = HigherLowerRules.selectPokemonByDifficulty(previous, candidates, category,
        state.config().difficulty(), context.random());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .currentPokemonId(current.id())
        .category(category)
        .answers(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static HigherLowerState reveal(HigherLowerState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.currentPokemonId() == null || state.category() == null) {
      return state;
    }
    var category = state.category();
    var previous = pokemon(context, state.previousPokemonId());
    var current = pokemon(context, state.currentPokemonId());
    int previousValue = HigherLowerRules.pokemonCategoryValue(previous, category);
    int currentValue = HigherLowerRules.pokemonCategoryValue(current, category);
    var correctAnswer = HigherLowerRules.higherLowerAnswer(previousValue, currentValue);
    var scores = new LinkedHashMap<>(state.scores());
    var streaks = new LinkedHashMap<>(state.streaks());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    var outcomes = new LinkedHashMap<String, HigherLowerOutcome>();
    for (var id : state.playerIds()) {
      var answer = state.answers().get(id);
      HigherLowerChoice choice = answer == null ? null : answer.choice();
      boolean correct = choice == correctAnswer;
      int streak = correct ? streaks.getOrDefault(id, 0) + 1 : 0;
      int basePoints = correct ? HigherLowerRules.POINTS.get(correctAnswer) : 0;
      int bonus = correct ? HigherLowerRules.streakBonus(streak) : 0;
      int speed = correct
          ? HigherLowerRules.speedBonus(Objects.requireNonNull(answer).answeredAt(),
              Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt"), state.config().roundSeconds())
          : 0;
      scores.put(id, scores.getOrDefault(id, 0) + basePoints + bonus + speed);
      streaks.put(id, streak);
      var prior = Objects.requireNonNull(playerStats.get(id), "playerStats");
      playerStats.put(id, new HigherLowerStats(
          prior.correct() + (correct ? 1 : 0),
          prior.incorrect() + (correct ? 0 : 1),
          prior.sameCorrect() + (correctAnswer == HigherLowerChoice.SAME && correct ? 1 : 0),
          prior.answered() + (choice != null ? 1 : 0),
          Math.max(prior.bestStreak(), streak)));
      outcomes.put(id, new HigherLowerOutcome(choice, correct, basePoints, bonus, speed, basePoints + bonus + speed, streak));
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .streaks(streaks)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(new HigherLowerRoundResult(previousValue, currentValue, correctAnswer, outcomes))
        .build();
  }

  private static HigherLowerState beginNextRound(HigherLowerState state, GameContext context) {
    return beginRound(state.toBuilder().previousPokemonId(Objects.requireNonNull(state.currentPokemonId())).build(), context);
  }

  private static HigherLowerState resolveIfComplete(HigherLowerState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.answers().containsKey(id), HigherLowerEngine::reveal);
  }

  /** Consume {@code random} una vez (Pokémon anterior). La configuración ya llega normalizada por {@link #parseConfig}. */
  @Override
  public HigherLowerState createInitialState(HigherLowerConfig config, GameContext context) {
    var pool = context.pokemon().forGenerations(config.generations());
    if (pool.size() < 2) throw new EngineException("Se necesitan al menos dos Pokémon en las generaciones seleccionadas.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var streaks = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, HigherLowerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      streaks.put(id, 0);
      playerStats.put(id, HigherLowerStats.ZERO);
    }
    return HigherLowerState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .roundNumber(0)
        .previousPokemonId(Randoms.randomItem(pool, context.random()).id())
        .scores(scores)
        .streaks(streaks)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public HigherLowerState start(HigherLowerState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<HigherLowerState> handleAction(HigherLowerState state, String playerId,
      HigherLowerAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La ronda no está activa.");
    if (!state.playerIds().contains(playerId)) return GameActionResult.reject(state, "No participas.");
    if (!context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    if (context.now() >= (state.roundEndsAt() == null ? 0 : state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
    }
    if (state.answers().containsKey(playerId)) return GameActionResult.reject(state, "Tu respuesta ya está bloqueada.");
    var answers = new LinkedHashMap<>(state.answers());
    answers.put(playerId, new HigherLowerAnswer(action.choice(), context.now()));
    return GameActionResult.accept(resolveIfComplete(state.toBuilder().answers(answers).build(), context));
  }

  @Override
  public HigherLowerState handleTimeout(HigherLowerState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public HigherLowerState handlePresenceChange(HigherLowerState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public HigherLowerPublicState getPublicState(HigherLowerState state, GameContext context) {
    boolean revealPhase = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    var previous = pokemon(context, state.previousPokemonId());
    var current = pokemon(context, state.currentPokemonId() != null ? state.currentPokemonId() : state.previousPokemonId());
    var category = state.category() != null ? state.category() : state.config().categories().getFirst();
    boolean showAnswers = state.config().answerVisibility() == HigherLowerAnswerVisibility.LIVE || revealPhase;
    return new HigherLowerPublicState(ID, state.phase(), state.playerIds(), state.roundNumber(), state.config().rounds(),
        category,
        pokemonView(previous, revealPhase || state.config().showPreviousValue()
            ? HigherLowerRules.pokemonCategoryValue(previous, category) : null),
        pokemonView(current, revealPhase ? HigherLowerRules.pokemonCategoryValue(current, category) : null),
        showAnswers ? state.answers() : Map.of(),
        new ArrayList<>(state.answers().keySet()),
        state.scores(), state.streaks(), state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        revealPhase ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? HigherLowerRules.buildHigherLowerResults(state) : null);
  }

  @Override
  public HigherLowerPlayerState getPlayerState(HigherLowerState state, String playerId, GameContext context) {
    return new HigherLowerPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId) && !state.answers().containsKey(playerId),
        state.answers().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(HigherLowerState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(HigherLowerState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(HigherLowerState state) {
    return HigherLowerRules.buildHigherLowerResults(state);
  }
}
