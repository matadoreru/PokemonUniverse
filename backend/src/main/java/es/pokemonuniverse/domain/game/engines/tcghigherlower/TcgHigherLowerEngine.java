package es.pokemonuniverse.domain.game.engines.tcghigherlower;

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
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgCardPublicView;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerAction;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerAnswer;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerChoice;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerOutcome;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerPlayerState;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerPublicState;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerRoundResult;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerState;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerStats;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog.Card;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog.Filters;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Traducción literal de {@code tcg-higher-lower/server.ts}. Sin {@code context.tcgCards} (las salas Java hasta la
 * etapa 2C) el mazo está vacío: {@link #checkAvailability} devuelve el literal y {@link #createInitialState} lanza.
 */
public final class TcgHigherLowerEngine
    implements GameEngine<TcgHigherLowerConfig, TcgHigherLowerState, TcgHigherLowerAction, TcgHigherLowerPublicState> {

  public static final String ID = "tcg-higher-lower";
  private static final long REVEAL_MS = 3_000;
  static final String UNAVAILABLE = "No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros.";

  private final GameManifest manifest;

  private static final TimedRoundStrategy<TcgHigherLowerState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public TcgHigherLowerState beginNext(TcgHigherLowerState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public TcgHigherLowerState resolveActive(TcgHigherLowerState state, GameContext context) {
      return reveal(state, context);
    }

    @Override
    public TcgHigherLowerState finish(TcgHigherLowerState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(TcgHigherLowerState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public TcgHigherLowerEngine(GameManifest manifest) {
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
  public TcgHigherLowerConfig parseConfig(JsonNode raw) {
    return TcgHigherLowerConfig.parse(raw);
  }

  @Override
  public TcgHigherLowerAction parseAction(JsonNode raw) {
    return TcgHigherLowerAction.parse(raw);
  }

  @Override
  public TcgHigherLowerConfig defaultConfig() {
    return TcgHigherLowerConfig.defaults();
  }

  /** {@code context.tcgCards?.cardsFor(config) ?? []}. */
  private static List<Card> pool(TcgHigherLowerConfig config, GameContext context) {
    var catalog = context.tcgCards();
    if (catalog == null) return List.of();
    return catalog.cardsFor(new Filters(config.generations(), config.setIds(), config.rarities(), config.minPrice(),
        config.maxPrice()));
  }

  @Override
  public Optional<String> checkAvailability(TcgHigherLowerConfig config, GameContext context) {
    return pool(config, context).size() >= 2 ? Optional.empty() : Optional.of(UNAVAILABLE);
  }

  private static TcgHigherLowerState beginRound(TcgHigherLowerState state, GameContext context) {
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .answers(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static TcgHigherLowerState reveal(TcgHigherLowerState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var previous = state.sequence().get(state.roundNumber() - 1);
    var current = state.sequence().get(state.roundNumber());
    var correctAnswer = TcgHigherLowerRules.tcgPriceComparison(previous.price(), current.price());
    var scores = new LinkedHashMap<>(state.scores());
    var streaks = new LinkedHashMap<>(state.streaks());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    var outcomes = new LinkedHashMap<String, TcgHigherLowerOutcome>();
    for (var id : state.playerIds()) {
      var answer = state.answers().get(id);
      TcgHigherLowerChoice choice = answer == null ? null : answer.choice();
      boolean correct = choice == correctAnswer;
      int streak = correct ? streaks.getOrDefault(id, 0) + 1 : 0;
      int awardedPoints = correct ? correctAnswer == TcgHigherLowerChoice.SAME ? 2 : 1 : 0;
      scores.put(id, scores.getOrDefault(id, 0) + awardedPoints);
      streaks.put(id, streak);
      var prior = Objects.requireNonNull(playerStats.get(id), "playerStats");
      playerStats.put(id, prior.afterComparison(correct, correct && correctAnswer == TcgHigherLowerChoice.SAME,
          choice != null, streak));
      outcomes.put(id, new TcgHigherLowerOutcome(choice, correct, awardedPoints, streak));
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .streaks(streaks)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(new TcgHigherLowerRoundResult(previous.price(), current.price(), correctAnswer, outcomes))
        .build();
  }

  private static TcgHigherLowerState resolveIfComplete(TcgHigherLowerState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.answers().containsKey(id), TcgHigherLowerEngine::reveal);
  }

  private static TcgCardPublicView cardView(Card card, @Nullable String price, boolean showRarity) {
    return new TcgCardPublicView(card.id(), card.name(), card.localId(), card.setId(), card.setName(),
        showRarity ? card.rarity() : null, card.imageUrl(), price);
  }

  /** Consume {@code random} en {@code contentDeck(pool, rounds + 1)}. La configuración ya llega normalizada. */
  @Override
  public TcgHigherLowerState createInitialState(TcgHigherLowerConfig config, GameContext context) {
    var pool = pool(config, context);
    if (pool.size() < 2) {
      throw new EngineException(UNAVAILABLE + " Ajusta las generaciones, sets, rarezas o precios.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var streaks = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, TcgHigherLowerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      streaks.put(id, 0);
      playerStats.put(id, TcgHigherLowerStats.ZERO);
    }
    return TcgHigherLowerState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .sequence(new ArrayList<>(Randoms.contentDeck(pool, config.rounds() + 1, context.random(), Card::id)))
        .roundNumber(0)
        .scores(scores)
        .streaks(streaks)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public TcgHigherLowerState start(TcgHigherLowerState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<TcgHigherLowerState> handleAction(TcgHigherLowerState state, String playerId,
      TcgHigherLowerAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La comparación no está activa.");
    if (!state.playerIds().contains(playerId)) return GameActionResult.reject(state, "No participas en esta partida.");
    if (!context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    if (context.now() >= (state.roundEndsAt() == null ? 0 : state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
    }
    if (state.answers().containsKey(playerId)) return GameActionResult.reject(state, "Tu respuesta ya está bloqueada.");
    var answers = new LinkedHashMap<>(state.answers());
    answers.put(playerId, new TcgHigherLowerAnswer(action.choice(), context.now()));
    return GameActionResult.accept(resolveIfComplete(state.toBuilder().answers(answers).build(), context));
  }

  @Override
  public TcgHigherLowerState handleTimeout(TcgHigherLowerState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public TcgHigherLowerState handlePresenceChange(TcgHigherLowerState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public TcgHigherLowerPublicState getPublicState(TcgHigherLowerState state, GameContext context) {
    boolean revealPhase = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    var previous = state.sequence().get(Math.max(0, state.roundNumber() - 1));
    var current = state.sequence().get(Math.max(1, state.roundNumber()));
    boolean showRarity = state.config().showRarity() || revealPhase;
    return new TcgHigherLowerPublicState(ID, state.phase(), state.playerIds(), state.roundNumber(),
        state.config().rounds(), previous.currency(),
        cardView(previous, previous.price(), showRarity),
        cardView(current, revealPhase ? current.price() : null, showRarity),
        new ArrayList<>(state.answers().keySet()), state.scores(), state.streaks(), state.roundStartedAt(),
        state.roundEndsAt(), state.nextTransitionAt(), revealPhase ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? TcgHigherLowerRules.buildTcgHigherLowerResults(state) : null);
  }

  @Override
  public TcgHigherLowerPlayerState getPlayerState(TcgHigherLowerState state, String playerId, GameContext context) {
    return new TcgHigherLowerPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && !state.answers().containsKey(playerId),
        state.answers().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(TcgHigherLowerState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(TcgHigherLowerState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(TcgHigherLowerState state) {
    return TcgHigherLowerRules.buildTcgHigherLowerResults(state);
  }
}
