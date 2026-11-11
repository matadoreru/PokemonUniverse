package es.pokemonuniverse.domain.game.engines.pokemonbluffauction;

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
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionAttempt;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionBidEvent;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionConditionTemplate;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionConditionView;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionPokemonView;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionRoundResult;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.PokemonBluffAuctionAction;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.PokemonBluffAuctionPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.PokemonBluffAuctionPublicState;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.PokemonBluffAuctionState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/** Traducción literal de {@code pokemon-bluff-auction/server.ts}. */
public final class PokemonBluffAuctionEngine implements GameEngine<PokemonBluffAuctionConfig,
    PokemonBluffAuctionState, PokemonBluffAuctionAction, PokemonBluffAuctionPublicState> {

  public static final String ID = "pokemon-bluff-auction";
  static final int BLUFF_SECONDS_PER_CORRECT_ATTEMPT = 5;
  static final int BLUFF_SECONDS_PER_INCORRECT_ATTEMPT = 3;
  static final long BLUFF_RESULT_REVEAL_MS = 5_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonBluffAuctionEngine(GameManifest manifest) {
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
  public PokemonBluffAuctionConfig parseConfig(JsonNode raw) {
    return PokemonBluffAuctionConfig.parse(raw);
  }

  @Override
  public PokemonBluffAuctionAction parseAction(JsonNode raw) {
    return PokemonBluffAuctionAction.parse(raw);
  }

  @Override
  public PokemonBluffAuctionConfig defaultConfig() {
    return PokemonBluffAuctionConfig.defaults();
  }

  private static <T> List<T> appended(List<T> values, T value) {
    var next = new ArrayList<T>(values);
    next.add(value);
    return next;
  }

  /** {@code canonicalPool}: la primera especie por defecto de cada número de Pokédex, en el orden del catálogo. */
  private static List<Pokemon> canonicalPool(GameContext context, PokemonBluffAuctionConfig config) {
    var byDex = new LinkedHashMap<Integer, Pokemon>();
    for (var pokemon : context.pokemon().forGenerations(config.generations(), false)) {
      if (!pokemon.isDefault() || byDex.containsKey(pokemon.nationalDexNumber())) continue;
      byDex.put(pokemon.nationalDexNumber(), pokemon);
    }
    return List.copyOf(byDex.values());
  }

  private static @Nullable String currentTurnPlayerId(PokemonBluffAuctionState state) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.bidOrder().isEmpty()) return null;
    return state.bidOrder().get(state.turnIndex() % state.bidOrder().size());
  }

  private static List<String> activeBidderIds(PokemonBluffAuctionState state) {
    return state.bidOrder().stream().filter(playerId -> !state.passedPlayerIds().contains(playerId)).toList();
  }

  /** {@code players.find(...)?.active === false}: solo quien ha abandonado, no quien está desconectado. */
  private static boolean playerDefinitivelyLeft(GameContext context, String playerId) {
    return context.players().stream()
        .filter(player -> player.id().equals(playerId))
        .findFirst()
        .map(player -> Boolean.FALSE.equals(player.active()))
        .orElse(false);
  }

  /** {@code bidSeconds > 0 ? now + bidSeconds * 1000 : null}. */
  private static @Nullable Long bidDeadline(PokemonBluffAuctionState state, GameContext context) {
    return state.config().bidSeconds() > 0 ? Long.valueOf(context.now() + state.config().bidSeconds() * 1_000L) : null;
  }

  /** {@code selectCondition}: una extracción de {@code random} sobre las plantillas aún no usadas. */
  private static BluffAuctionConditionTemplate selectCondition(PokemonBluffAuctionState state, GameContext context,
      List<String> usedOut) {
    var unused = state.conditionTemplates().stream()
        .filter(template -> !state.usedConditionKeys().contains(template.key()))
        .toList();
    var source = !unused.isEmpty() ? unused : state.conditionTemplates();
    var selected = source.get((int) Math.floor(context.random().getAsDouble() * source.size()));
    var used = new LinkedHashSet<>(state.usedConditionKeys());
    used.add(selected.key());
    if (used.size() != state.conditionTemplates().size()) usedOut.addAll(used);
    return selected;
  }

  /** Consume {@code random} al elegir la condición y, después, al barajar el orden de puja. */
  private static PokemonBluffAuctionState beginRound(PokemonBluffAuctionState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    var used = new ArrayList<String>();
    var selected = selectCondition(state, context, used);
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .condition(selected.condition())
        .validPokemonIds(selected.candidatePokemonIds())
        .usedConditionKeys(used)
        .bidOrder(Randoms.shuffled(state.playerIds(), context.random()))
        .turnIndex(0)
        .passedPlayerIds(List.of())
        .currentBid(null)
        .currentBidderId(null)
        .bidHistory(List.of())
        .bidderId(null)
        .targetBid(null)
        .attempts(List.of())
        .usedPokemonIds(List.of())
        .correctCount(0)
        .incorrectCount(0)
        .roundEndsAt(bidDeadline(state, context))
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static BluffAuctionPlayerStats stats(PokemonBluffAuctionState state, String playerId) {
    return Objects.requireNonNullElse(state.playerStats().get(playerId),
        PokemonBluffAuctionRules.emptyBluffAuctionStats());
  }

  /** {@code reason} es {@code COMPLETED}, {@code TIMEOUT}, {@code IMPOSSIBLE} o {@code BIDDER_LEFT}. */
  private static PokemonBluffAuctionState finishRound(PokemonBluffAuctionState state, GameContext context,
      boolean success, String reason) {
    var bidderId = Objects.requireNonNull(state.bidderId(), "bidderId");
    int bid = Objects.requireNonNull(state.targetBid(), "targetBid");
    var pointsAwarded = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      boolean bidder = playerId.equals(bidderId);
      pointsAwarded.put(playerId, success
          ? (bidder ? PokemonBluffAuctionRules.BLUFF_BIDDER_SUCCESS_POINTS : 0)
          : (bidder ? 0 : PokemonBluffAuctionRules.BLUFF_OTHERS_SUCCESS_POINTS));
    }
    var scores = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      scores.put(playerId, Objects.requireNonNullElse(state.scores().get(playerId), 0)
          + Objects.requireNonNullElse(pointsAwarded.get(playerId), 0));
    }
    var playerStats = new LinkedHashMap<String, BluffAuctionPlayerStats>();
    for (var playerId : state.playerIds()) {
      playerStats.put(playerId, stats(state, playerId)
          .afterRound(success, playerId.equals(bidderId), bid, reason.equals("IMPOSSIBLE")));
    }
    var condition = Objects.requireNonNull(state.condition(), "condition");
    var lastRound = BluffAuctionRoundResult.builder()
        .bidderId(bidderId)
        .bid(bid)
        .success(success)
        .reason(reason)
        .condition(new BluffAuctionConditionView(condition.description(), condition.clauses()))
        .attempts(state.attempts())
        .correctCount(state.correctCount())
        .incorrectCount(state.incorrectCount())
        .validPokemonCount(reason.equals("IMPOSSIBLE") ? Integer.valueOf(state.validPokemonIds().size()) : null)
        .pointsAwarded(pointsAwarded)
        .build();
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + BLUFF_RESULT_REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static PokemonBluffAuctionState beginDemonstration(PokemonBluffAuctionState state, GameContext context,
      String bidderId) {
    int bid = state.currentBid() == null ? 1 : state.currentBid();
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(bidderId, stats(state, bidderId).afterBidderStart(bid));
    var next = state.toBuilder()
        .phase(GamePhase.POKEMON_SEARCH)
        .bidderId(bidderId)
        .targetBid(bid)
        .currentBid(bid)
        .currentBidderId(bidderId)
        .playerStats(playerStats)
        .roundEndsAt(context.now() + state.config().demonstrationSeconds() * 1_000L)
        .nextTransitionAt(null)
        .build();
    return bid > state.validPokemonIds().size() ? finishRound(next, context, false, "IMPOSSIBLE") : next;
  }

  /** {@code active[0] ?? currentBidderId ?? bidOrder[0]} demuestra cuando queda uno o ninguno. */
  private static PokemonBluffAuctionState settleIfOneRemains(PokemonBluffAuctionState state, GameContext context) {
    var active = activeBidderIds(state);
    if (active.size() > 1) return state;
    String bidderId = !active.isEmpty() ? active.getFirst()
        : state.currentBidderId() != null ? state.currentBidderId()
        : state.bidOrder().getFirst();
    return beginDemonstration(state, context, bidderId);
  }

  /** Pasa el turno; quien no está conectado pasa solo. Tras el {@code break} también se comprueba el cierre. */
  private static PokemonBluffAuctionState advanceTurn(PokemonBluffAuctionState state, GameContext context) {
    var next = state;
    int checked = 0;
    while (checked < next.bidOrder().size()) {
      int index = (next.turnIndex() + 1) % next.bidOrder().size();
      next = next.toBuilder().turnIndex(index).roundEndsAt(bidDeadline(state, context)).build();
      var playerId = Objects.requireNonNull(currentTurnPlayerId(next));
      if (!next.passedPlayerIds().contains(playerId) && context.isPlayerRequired(playerId)) break;
      if (!next.passedPlayerIds().contains(playerId)) {
        next = next.toBuilder()
            .passedPlayerIds(appended(next.passedPlayerIds(), playerId))
            .bidHistory(appended(next.bidHistory(), BluffAuctionBidEvent.pass(playerId)))
            .build();
      }
      var settled = settleIfOneRemains(next, context);
      if (settled.phase() != GamePhase.ROUND_ACTIVE) return settled;
      checked += 1;
    }
    return settleIfOneRemains(next, context);
  }

  /** {@code playerId} pasa: se cierra la puja si queda uno y, si no, avanza el turno. */
  private static PokemonBluffAuctionState passAndAdvance(PokemonBluffAuctionState state, String playerId,
      GameContext context) {
    var next = state.toBuilder()
        .passedPlayerIds(appended(state.passedPlayerIds(), playerId))
        .bidHistory(appended(state.bidHistory(), BluffAuctionBidEvent.pass(playerId)))
        .build();
    var settled = settleIfOneRemains(next, context);
    return settled.phase() == GamePhase.ROUND_ACTIVE ? advanceTurn(settled, context) : settled;
  }

  /** Consume {@code random} solo en el generador de condiciones compartido. */
  @Override
  public PokemonBluffAuctionState createInitialState(PokemonBluffAuctionConfig config, GameContext context) {
    var pool = canonicalPool(context, config);
    if (pool.isEmpty()) throw new EngineException("No hay especies normales disponibles para estas generaciones.");
    var templates = PokemonBluffAuctionConditions.buildBluffAuctionConditions(pool, config.generations(),
        context.random());
    if (templates.isEmpty()) {
      throw new EngineException("No se pudieron generar condiciones interesantes para este pool.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, BluffAuctionPlayerStats>();
    for (var playerId : playerIds) {
      scores.put(playerId, 0);
      playerStats.put(playerId, PokemonBluffAuctionRules.emptyBluffAuctionStats());
    }
    return PokemonBluffAuctionState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .conditionTemplates(templates)
        .usedConditionKeys(List.of())
        .roundNumber(0)
        .condition(null)
        .validPokemonIds(List.of())
        .bidOrder(List.of())
        .turnIndex(0)
        .passedPlayerIds(List.of())
        .currentBid(null)
        .currentBidderId(null)
        .bidHistory(List.of())
        .bidderId(null)
        .targetBid(null)
        .attempts(List.of())
        .usedPokemonIds(List.of())
        .correctCount(0)
        .incorrectCount(0)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  @Override
  public PokemonBluffAuctionState start(PokemonBluffAuctionState state, GameContext context) {
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<PokemonBluffAuctionState> handleAction(PokemonBluffAuctionState state, String playerId,
      PokemonBluffAuctionAction action, GameContext context) {
    if ((state.phase() == GamePhase.POKEMON_SEARCH || state.phase() == GamePhase.ROUND_ACTIVE)
        && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
    }
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes actuar ahora.");
    }
    if (action instanceof PokemonBluffAuctionAction.RaiseBid || action instanceof PokemonBluffAuctionAction.PassBid) {
      if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La subasta ya ha terminado.");
      if (!playerId.equals(currentTurnPlayerId(state))) return GameActionResult.reject(state, "No es tu turno.");
      if (state.passedPlayerIds().contains(playerId)) {
        return GameActionResult.reject(state, "Ya has pasado esta ronda.");
      }
      if (action instanceof PokemonBluffAuctionAction.RaiseBid raise) {
        int minimum = (state.currentBid() == null ? 0 : state.currentBid()) + 1;
        if (raise.amount() < minimum) return GameActionResult.reject(state, "La puja mínima es " + minimum + ".");
        if (raise.amount() > state.poolIds().size()) {
          return GameActionResult.reject(state, "La puja máxima es " + state.poolIds().size() + ".");
        }
        int amount = (int) raise.amount();
        var next = state.toBuilder()
            .currentBid(amount)
            .currentBidderId(playerId)
            .bidHistory(appended(state.bidHistory(), BluffAuctionBidEvent.bid(playerId, amount)))
            .build();
        return GameActionResult.accept(advanceTurn(next, context));
      }
      return GameActionResult.accept(passAndAdvance(state, playerId, context));
    }
    if (state.phase() != GamePhase.POKEMON_SEARCH || !playerId.equals(state.bidderId())) {
      return GameActionResult.reject(state, "Solo el apostador puede demostrar la apuesta.");
    }
    var submit = (PokemonBluffAuctionAction.SubmitPokemon) action;
    var found = context.pokemon().byId(submit.pokemonId());
    if (found.isEmpty() || !state.poolIds().contains(found.get().id())) {
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool de especies configurado.");
    }
    var pokemon = found.get();
    if (state.usedPokemonIds().contains(pokemon.id())) {
      var duplicate = new BluffAuctionAttempt(BluffAuctionPokemonView.of(pokemon), "DUPLICATE", context.now());
      return GameActionResult.accept(state.toBuilder().attempts(appended(state.attempts(), duplicate)).build());
    }
    boolean correct = state.validPokemonIds().contains(pokemon.id());
    var attempt = new BluffAuctionAttempt(BluffAuctionPokemonView.of(pokemon), correct ? "CORRECT" : "INCORRECT",
        context.now());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats(state, playerId).afterAttempt(correct));
    long deadline = state.roundEndsAt() == null ? context.now() : state.roundEndsAt();
    var next = state.toBuilder()
        .usedPokemonIds(appended(state.usedPokemonIds(), pokemon.id()))
        .attempts(appended(state.attempts(), attempt))
        .correctCount(state.correctCount() + (correct ? 1 : 0))
        .incorrectCount(state.incorrectCount() + (correct ? 0 : 1))
        .roundEndsAt(deadline + (correct ? BLUFF_SECONDS_PER_CORRECT_ATTEMPT
            : -BLUFF_SECONDS_PER_INCORRECT_ATTEMPT) * 1_000L)
        .playerStats(playerStats)
        .build();
    if (next.targetBid() != null && next.correctCount() >= next.targetBid()) {
      return GameActionResult.accept(finishRound(next, context, true, "COMPLETED"));
    }
    if (next.roundEndsAt() != null && next.roundEndsAt() <= context.now()) {
      return GameActionResult.accept(finishRound(next, context, false, "TIMEOUT"));
    }
    return GameActionResult.accept(next);
  }

  @Override
  public PokemonBluffAuctionState handleTimeout(PokemonBluffAuctionState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      var playerId = currentTurnPlayerId(state);
      if (playerId == null) return state;
      return passAndAdvance(state, playerId, context);
    }
    if (state.phase() == GamePhase.POKEMON_SEARCH && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return finishRound(state, context, false, "TIMEOUT");
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginRound(state, context);
    }
    return state;
  }

  @Override
  public PokemonBluffAuctionState handlePresenceChange(PokemonBluffAuctionState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE) {
      var turnPlayerId = currentTurnPlayerId(state);
      if (turnPlayerId != null && !context.isPlayerRequired(turnPlayerId)) {
        var next = state.passedPlayerIds().contains(turnPlayerId) ? state : state.toBuilder()
            .passedPlayerIds(appended(state.passedPlayerIds(), turnPlayerId))
            .bidHistory(appended(state.bidHistory(), BluffAuctionBidEvent.pass(turnPlayerId)))
            .build();
        var settled = settleIfOneRemains(next, context);
        return settled.phase() == GamePhase.ROUND_ACTIVE ? advanceTurn(settled, context) : settled;
      }
    }
    if (state.phase() == GamePhase.POKEMON_SEARCH && state.bidderId() != null && !state.bidderId().isEmpty()
        && playerDefinitivelyLeft(context, state.bidderId())) {
      return finishRound(state, context, false, "BIDDER_LEFT");
    }
    return state;
  }

  @Override
  public PokemonBluffAuctionPublicState getPublicState(PokemonBluffAuctionState state, GameContext context) {
    var condition = state.condition() == null ? null
        : new BluffAuctionConditionView(state.condition().description(), state.condition().clauses());
    int remaining = Math.max(0, (state.targetBid() == null ? 0 : state.targetBid()) - state.correctCount());
    int currentBid = state.currentBid() == null ? 0 : state.currentBid();
    return PokemonBluffAuctionPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .roundNumber(state.roundNumber())
        .totalRounds(state.config().rounds())
        .playerIds(state.playerIds())
        .condition(condition)
        .bidOrder(state.bidOrder())
        .currentTurnPlayerId(currentTurnPlayerId(state))
        .passedPlayerIds(state.passedPlayerIds())
        .currentBid(state.currentBid())
        .minimumBid(currentBid + 1)
        .currentBidderId(state.currentBidderId())
        .bidHistory(state.bidHistory())
        .maxBid(state.poolIds().size())
        .bidderId(state.bidderId())
        .targetBid(state.targetBid())
        .attempts(state.attempts())
        .correctCount(state.correctCount())
        .incorrectCount(state.incorrectCount())
        .remainingCount(remaining)
        .scores(state.scores())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .lastRound(state.phase() == GamePhase.ROUND_RESULTS ? state.lastRound() : null)
        .results(state.phase() == GamePhase.GAME_RESULTS
            ? PokemonBluffAuctionRules.buildPokemonBluffAuctionResults(state) : null)
        .build();
  }

  @Override
  public PokemonBluffAuctionPlayerState getPlayerState(PokemonBluffAuctionState state, String playerId,
      GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return PokemonBluffAuctionPlayerState.SPECTATOR;
    }
    boolean onTurn = state.phase() == GamePhase.ROUND_ACTIVE && playerId.equals(currentTurnPlayerId(state))
        && !state.passedPlayerIds().contains(playerId);
    return new PokemonBluffAuctionPlayerState("PLAYER", onTurn, onTurn,
        state.phase() == GamePhase.POKEMON_SEARCH && playerId.equals(state.bidderId()));
  }

  @Override
  public GameLifecycle getLifecycle(PokemonBluffAuctionState state) {
    // timedGameLifecycle({ ...state, turnNumber: state.bidHistory.length }).
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundNumber(state.roundNumber())
        .turnNumber(state.bidHistory().size())
        .turnIndex(state.turnIndex())
        .build();
  }

  @Override
  public boolean isFinished(PokemonBluffAuctionState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonBluffAuctionState state) {
    return PokemonBluffAuctionRules.buildPokemonBluffAuctionResults(state);
  }
}
