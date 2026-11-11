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
import es.pokemonuniverse.domain.pokemon.PokemonSpritePaths;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/** Traducción literal del TS que antes estaba en {@code higher-lower/server.ts}. */
public final class HigherLowerEngine
    implements GameEngine<HigherLowerConfig, HigherLowerState, HigherLowerAction, HigherLowerPublicState> {

  public static final String ID = "higher-lower";
  private static final long REVEAL_MS = 3_000;
  /** Tope de seguridad de {@code ENDLESS}: la partida acaba a las 100 rondas aunque quede alguien en pie. */
  public static final int ENDLESS_MAX_ROUNDS = 100;

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

    /** En {@code ENDLESS} acaba cuando no queda nadie en pie o en el tope de rondas; {@code rounds} no se usa. */
    @Override
    public boolean isComplete(HigherLowerState state) {
      if (endless(state)) return state.alive().isEmpty() || state.roundNumber() >= ENDLESS_MAX_ROUNDS;
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

  private static boolean endless(HigherLowerState state) {
    return state.config().mode() == HigherLowerMode.ENDLESS;
  }

  private static Pokemon pokemon(GameContext context, String id) {
    return context.pokemon().byId(id).orElseThrow(() -> new EngineException("Pokémon desconocido: " + id));
  }

  /** El sprite va por el proxy: la URL de PokéAPI lleva el número de Pokédex, la respuesta de la categoría DEX_NUMBER. */
  private static HigherLowerPokemonView pokemonView(Pokemon pokemon, @Nullable Integer value) {
    return new HigherLowerPokemonView(pokemon.id(), pokemon.name(), PokemonSpritePaths.of(pokemon.id()), value);
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
    boolean endless = endless(state);
    var alive = new ArrayList<String>();
    // En ENDLESS solo juegan los que siguen en pie: los eliminados no tienen resultado ni estadísticas nuevas.
    for (var id : endless ? state.alive() : state.playerIds()) {
      var answer = state.answers().get(id);
      HigherLowerChoice choice = answer == null ? null : answer.choice();
      boolean correct = choice == correctAnswer;
      // En ENDLESS un fallo (o no responder) elimina y la racha se congela; cada acierto vale 1, sin bonus.
      int streak = correct ? streaks.getOrDefault(id, 0) + 1 : endless ? streaks.getOrDefault(id, 0) : 0;
      if (endless && correct) alive.add(id);
      int basePoints = !correct ? 0 : endless ? 1 : HigherLowerRules.POINTS.get(correctAnswer);
      int bonus = correct && !endless ? HigherLowerRules.streakBonus(streak) : 0;
      int speed = correct && !endless
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
        .alive(endless ? alive : state.alive())
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(new HigherLowerRoundResult(previousValue, currentValue, correctAnswer, outcomes))
        .build();
  }

  private static HigherLowerState beginNextRound(HigherLowerState state, GameContext context) {
    return beginRound(state.toBuilder().previousPokemonId(Objects.requireNonNull(state.currentPokemonId())).build(), context);
  }

  /** En {@code ENDLESS} la ronda la completan los que siguen en pie (un eliminado conectado no la bloquea). */
  private static HigherLowerState resolveIfComplete(HigherLowerState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, endless(state) ? state.alive() : state.playerIds(),
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
        .alive(playerIds)
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
    if (endless(state) && !state.alive().contains(playerId)) return GameActionResult.reject(state, "Estás eliminado.");
    if (!context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
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
    boolean endless = endless(state);
    return new HigherLowerPublicState(ID, state.phase(), state.config().mode(), state.playerIds(), state.roundNumber(),
        endless ? ENDLESS_MAX_ROUNDS : state.config().rounds(),
        category,
        pokemonView(previous, revealPhase || state.config().showPreviousValue()
            ? HigherLowerRules.pokemonCategoryValue(previous, category) : null),
        pokemonView(current, revealPhase ? HigherLowerRules.pokemonCategoryValue(current, category) : null),
        showAnswers ? state.answers() : Map.of(),
        new ArrayList<>(state.answers().keySet()),
        state.scores(), state.streaks(), endless ? state.alive() : null,
        state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        revealPhase ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? HigherLowerRules.buildHigherLowerResults(state) : null);
  }

  @Override
  public HigherLowerPlayerState getPlayerState(HigherLowerState state, String playerId, GameContext context) {
    return new HigherLowerPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && (!endless(state) || state.alive().contains(playerId))
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
