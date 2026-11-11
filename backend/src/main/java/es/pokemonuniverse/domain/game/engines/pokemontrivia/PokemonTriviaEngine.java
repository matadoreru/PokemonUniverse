package es.pokemonuniverse.domain.game.engines.pokemontrivia;

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
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaAction;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaAnswer;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaOptionDetails;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaPublicState;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaRole;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaRoundResult;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaState;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaStats;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code pokemon-trivia/server.ts}; la generación de preguntas está en {@link PokemonTriviaQuestions}. */
public final class PokemonTriviaEngine
    implements GameEngine<PokemonTriviaConfig, PokemonTriviaState, PokemonTriviaAction, PokemonTriviaPublicState> {

  public static final String ID = "pokemon-trivia";
  public static final long REVEAL_MS = 4_000;

  private final GameManifest manifest;

  private static final TimedRoundStrategy<PokemonTriviaState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public PokemonTriviaState beginNext(PokemonTriviaState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public PokemonTriviaState resolveActive(PokemonTriviaState state, GameContext context) {
      return revealRound(state, context);
    }

    @Override
    public PokemonTriviaState finish(PokemonTriviaState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(PokemonTriviaState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonTriviaEngine(GameManifest manifest) {
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
  public PokemonTriviaConfig parseConfig(JsonNode raw) {
    return PokemonTriviaConfig.parse(raw);
  }

  @Override
  public PokemonTriviaAction parseAction(JsonNode raw) {
    return PokemonTriviaAction.parse(raw);
  }

  @Override
  public PokemonTriviaConfig defaultConfig() {
    return PokemonTriviaConfig.defaults();
  }

  private static PokemonTriviaState beginRound(PokemonTriviaState state, GameContext context) {
    var question = PokemonTriviaQuestions.create(state, context);
    var usedQuestionKeys = new ArrayList<>(state.usedQuestionKeys());
    usedQuestionKeys.add(question.key());
    var recent = state.recentQuestionTypes();
    var recentQuestionTypes = new ArrayList<>(recent.subList(Math.max(0, recent.size() - 1), recent.size()));
    recentQuestionTypes.add(question.type());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .question(question)
        .usedQuestionKeys(usedQuestionKeys)
        .recentQuestionTypes(recentQuestionTypes)
        .answers(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static PokemonTriviaState revealRound(PokemonTriviaState state, GameContext context) {
    var question = state.question();
    if (state.phase() != GamePhase.ROUND_ACTIVE || question == null) return state;
    var scores = new LinkedHashMap<>(state.scores());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    var points = new LinkedHashMap<String, Integer>();
    long roundStartedAt = Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
    for (var playerId : state.playerIds()) {
      var answer = state.answers().get(playerId);
      boolean correct = answer != null && answer.optionId() == question.correctOptionId();
      var previous = playerStats.getOrDefault(playerId, PokemonTriviaStats.empty());
      long elapsedMs = answer != null ? answer.answeredAt() - roundStartedAt : 0;
      int earned = correct
          ? PokemonTriviaRules.pokemonTriviaPoints(roundStartedAt, state.config().roundSeconds(), answer.answeredAt())
          : 0;
      points.put(playerId, earned);
      scores.put(playerId, scores.getOrDefault(playerId, 0) + earned);
      playerStats.put(playerId, previous.afterRound(question.type(), answer != null, correct, elapsedMs, earned));
    }
    var optionDetails = new LinkedHashMap<String, PokemonTriviaOptionDetails>();
    for (var option : question.options()) {
      var pokemon = context.pokemon().byId(option.pokemon().id())
          .orElseThrow(() -> new EngineException("Pokémon desconocido: " + option.pokemon().id()));
      optionDetails.put(option.id().name(), PokemonTriviaOptionDetails.of(pokemon));
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(new PokemonTriviaRoundResult(question.correctOptionId(), question.fact(),
            new LinkedHashMap<>(state.answers()), points, optionDetails))
        .build();
  }

  private static PokemonTriviaState resolveIfComplete(PokemonTriviaState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.answers().containsKey(id), PokemonTriviaEngine::revealRound);
  }

  /** El pool usa solo formas por defecto con id, nombre y sprite no vacíos. */
  @Override
  public PokemonTriviaState createInitialState(PokemonTriviaConfig config, GameContext context) {
    var pool = context.pokemon().forGenerations(config.generations()).stream()
        .filter(pokemon -> present(pokemon.id()) && present(pokemon.name()) && present(pokemon.sprite()))
        .toList();
    if (pool.size() < config.optionCount()) {
      throw new EngineException("Se necesitan al menos " + config.optionCount()
          + " Pokémon en las generaciones seleccionadas.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, PokemonTriviaStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, PokemonTriviaStats.empty());
    }
    return PokemonTriviaState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  private static boolean present(String value) {
    return value != null && !value.isEmpty();
  }

  @Override
  public PokemonTriviaState start(PokemonTriviaState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  /** Una respuesta tardía se rechaza pero revela la ronda ({@code state: revealRound(state, context)} en TS). */
  @Override
  public GameActionResult<PokemonTriviaState> handleAction(PokemonTriviaState state, String playerId,
      PokemonTriviaAction action, GameContext context) {
    var question = state.question();
    if (state.phase() != GamePhase.ROUND_ACTIVE || question == null) {
      return GameActionResult.reject(state, "No hay una pregunta activa.");
    }
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
    }
    if (state.answers().containsKey(playerId)) return GameActionResult.reject(state, "Tu respuesta ya está bloqueada.");
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(revealRound(state, context), "El tiempo ha terminado.");
    }
    if (question.options().stream().noneMatch(option -> option.id() == action.optionId())) {
      return GameActionResult.reject(state, "Esa opción no pertenece a la pregunta.");
    }
    var answers = new LinkedHashMap<>(state.answers());
    answers.put(playerId, new PokemonTriviaAnswer(action.optionId(), context.now()));
    return GameActionResult.accept(resolveIfComplete(state.toBuilder().answers(answers).build(), context));
  }

  @Override
  public PokemonTriviaState handleTimeout(PokemonTriviaState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public PokemonTriviaState handlePresenceChange(PokemonTriviaState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public PokemonTriviaPublicState getPublicState(PokemonTriviaState state, GameContext context) {
    boolean reveal = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    var question = state.question();
    return new PokemonTriviaPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        state.config().difficulty(),
        question == null ? null : question.prompt(),
        question == null ? null : question.type(),
        question == null ? List.of() : question.options(),
        new ArrayList<>(state.answers().keySet()),
        state.scores(), state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        reveal ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? PokemonTriviaRules.buildPokemonTriviaResults(state) : null);
  }

  @Override
  public PokemonTriviaPlayerState getPlayerState(PokemonTriviaState state, String playerId, GameContext context) {
    boolean participant = state.playerIds().contains(playerId);
    return new PokemonTriviaPlayerState(participant ? PokemonTriviaRole.PLAYER : PokemonTriviaRole.SPECTATOR,
        state.phase() == GamePhase.ROUND_ACTIVE && participant && context.isPlayerRequired(playerId)
            && !state.answers().containsKey(playerId),
        state.answers().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(PokemonTriviaState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokemonTriviaState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonTriviaState state) {
    return PokemonTriviaRules.buildPokemonTriviaResults(state);
  }
}
