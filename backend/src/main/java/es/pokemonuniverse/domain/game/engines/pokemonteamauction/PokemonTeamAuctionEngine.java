package es.pokemonuniverse.domain.game.engines.pokemonteamauction;

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
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.PokemonTeamAuctionAction;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.PokemonTeamAuctionPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.PokemonTeamAuctionPublicState;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.PokemonTeamAuctionState;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionBidEvent;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionLotResult;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionLotPokemon;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionParticipant;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionTypes.TeamAuctionPokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;

/** Traducción literal de {@code pokemon-team-auction/server.ts}. */
public final class PokemonTeamAuctionEngine implements GameEngine<PokemonTeamAuctionConfig, PokemonTeamAuctionState,
    PokemonTeamAuctionAction, PokemonTeamAuctionPublicState> {

  public static final String ID = "pokemon-team-auction";
  /** Tamaño máximo de un equipo. */
  static final int TEAM_SIZE = 6;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokemonTeamAuctionEngine(GameManifest manifest) {
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
  public PokemonTeamAuctionConfig parseConfig(JsonNode raw) {
    return PokemonTeamAuctionConfig.parse(raw);
  }

  @Override
  public PokemonTeamAuctionAction parseAction(JsonNode raw) {
    return PokemonTeamAuctionAction.parse(raw);
  }

  @Override
  public PokemonTeamAuctionConfig defaultConfig() {
    return PokemonTeamAuctionConfig.defaults();
  }

  /** {@code Boolean(value)} de una cadena de JS. */
  private static boolean truthy(@Nullable String value) {
    return value != null && !value.isEmpty();
  }

  private static <T> List<T> rotate(List<T> values, int offset) {
    if (values.isEmpty()) return List.of();
    int start = offset % values.size();
    var rotated = new ArrayList<T>(values.subList(start, values.size()));
    rotated.addAll(values.subList(0, start));
    return rotated;
  }

  private static <T> List<T> appended(List<T> values, T value) {
    var next = new ArrayList<T>(values);
    next.add(value);
    return next;
  }

  /** Consume {@code random} al barajar el pool una vez; los lotes lo recorren en círculo. */
  private static List<TeamAuctionPokemon> poolFor(GameContext context, PokemonTeamAuctionConfig config,
      int totalLots) {
    var pool = context.pokemon().forGenerations(config.generations(), config.includeForms()).stream()
        .filter(pokemon -> truthy(pokemon.sprite()) && (config.includeForms() || pokemon.isDefault()))
        .toList();
    if (pool.isEmpty()) throw new EngineException("No hay Pokémon disponibles con estas generaciones.");
    var shuffledPool = Randoms.shuffled(pool, context.random());
    var lots = new ArrayList<TeamAuctionPokemon>();
    for (int index = 0; index < totalLots; index++) {
      var pokemon = shuffledPool.get(index % shuffledPool.size());
      lots.add(new TeamAuctionPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.baseStatTotal(),
          Objects.requireNonNullElse(pokemon.legendaryStatus(), "NORMAL")));
    }
    return lots;
  }

  private static @Nullable TeamAuctionParticipant participant(PokemonTeamAuctionState state, String playerId) {
    return state.participants().get(playerId);
  }

  private static int requiredBid(PokemonTeamAuctionState state) {
    return (state.currentBid() == null ? 0 : state.currentBid()) + 1;
  }

  /** {@code state.lots[state.currentLotIndex]}: {@code undefined} fuera de rango (también con el índice -1). */
  private static @Nullable TeamAuctionPokemon currentLot(PokemonTeamAuctionState state) {
    int index = state.currentLotIndex();
    return index >= 0 && index < state.lots().size() ? state.lots().get(index) : null;
  }

  private static @Nullable String currentTurnPlayerId(PokemonTeamAuctionState state) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.turnOrder().isEmpty()) return null;
    return state.turnOrder().get(state.turnIndex() % state.turnOrder().size());
  }

  private static int nextTurnIndex(PokemonTeamAuctionState state) {
    return (state.turnIndex() + 1) % Math.max(1, state.turnOrder().size());
  }

  private static boolean eligibleForLot(PokemonTeamAuctionState state, String playerId, GameContext context) {
    var current = participant(state, playerId);
    return current != null && current.team().size() < TEAM_SIZE && context.isPlayerRequired(playerId)
        && current.coins() >= requiredBid(state);
  }

  private static int lotsWonBy(PokemonTeamAuctionState state, String playerId) {
    return (int) state.lotHistory().stream().filter(lot -> playerId.equals(lot.winnerId())).count();
  }

  private static int unownedLots(PokemonTeamAuctionState state) {
    return (int) state.lotHistory().stream().filter(lot -> lot.winnerId() == null).count();
  }

  private static PokemonTeamAuctionState finishGame(PokemonTeamAuctionState state) {
    var playerStats = new LinkedHashMap<String, TeamAuctionPlayerStats>();
    for (var playerId : state.playerIds()) {
      var current = Objects.requireNonNull(state.participants().get(playerId));
      playerStats.put(playerId,
          PokemonTeamAuctionRules.participantStats(current, lotsWonBy(state, playerId), unownedLots(state)));
    }
    var results = PokemonTeamAuctionRules.buildTeamAuctionResults(
        state.toBuilder().phase(GamePhase.GAME_RESULTS).playerStats(playerStats).build());
    return state.toBuilder()
        .roundEndsAt(null)
        .phase(GamePhase.GAME_RESULTS)
        .currentBid(null)
        .currentBidderId(null)
        .passedPlayerIds(List.of())
        .playerStats(playerStats)
        .results(results)
        .build();
  }

  /** Consume {@code random} al barajar el orden de turno del lote. */
  private static PokemonTeamAuctionState beginLot(PokemonTeamAuctionState state, int lotIndex,
      GameContext context) {
    if (lotIndex >= state.lots().size()) return finishGame(state);
    var next = state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundEndsAt(null)
        .currentLotIndex(lotIndex)
        .currentBid(null)
        .currentBidderId(null)
        .passedPlayerIds(List.of())
        .turnOrder(rotate(Randoms.shuffled(state.playerIds(), context.random()),
            lotIndex % Math.max(1, state.playerIds().size())))
        .turnIndex(0)
        .build();
    return normalizeTurn(next, context);
  }

  private static PokemonTeamAuctionState settleLot(PokemonTeamAuctionState state, GameContext context) {
    var lot = currentLot(state);
    if (lot == null) return finishGame(state);
    var currentBid = state.currentBid();
    var result = new TeamAuctionLotResult(state.currentLotIndex() + 1, lot, state.currentBidderId(),
        currentBid == null ? 0 : currentBid);
    int nextLot = state.currentLotIndex() + 1;
    if (!truthy(state.currentBidderId()) || currentBid == null) {
      return beginLot(state.toBuilder().lotHistory(appended(state.lotHistory(), result)).build(), nextLot, context);
    }
    var winner = participant(state, state.currentBidderId());
    if (winner == null || winner.coins() < currentBid || winner.team().size() >= TEAM_SIZE) {
      return beginLot(state.toBuilder().lotHistory(appended(state.lotHistory(), result.unowned())).build(), nextLot,
          context);
    }
    var participants = new LinkedHashMap<>(state.participants());
    participants.put(state.currentBidderId(), winner.afterWinning(currentBid, lot));
    return beginLot(
        state.toBuilder().participants(participants).lotHistory(appended(state.lotHistory(), result)).build(),
        nextLot, context);
  }

  /**
   * Avanza el turno hasta alguien que pueda pujar; quien no puede (sin monedas, desconectado o con el equipo
   * completo) pasa solo, salvo el mejor postor. Si no queda nadie activo, se adjudica el lote.
   */
  private static PokemonTeamAuctionState normalizeTurn(PokemonTeamAuctionState state, GameContext context) {
    var next = state;
    int checked = 0;
    while (checked < next.turnOrder().size()) {
      var currentId = currentTurnPlayerId(next);
      if (currentId == null) return settleLot(next, context);
      var current = participant(next, currentId);
      boolean canAct = current != null && current.team().size() < TEAM_SIZE && context.isPlayerRequired(currentId)
          && !next.passedPlayerIds().contains(currentId) && !currentId.equals(next.currentBidderId())
          && current.coins() >= requiredBid(next);
      if (canAct) {
        Long deadline = next.roundEndsAt() != null ? next.roundEndsAt()
            : next.config().bidSeconds() > 0 ? Long.valueOf(context.now() + next.config().bidSeconds() * 1_000L)
            : null;
        return next.toBuilder().roundEndsAt(deadline).build();
      }
      if (!next.passedPlayerIds().contains(currentId) && !currentId.equals(next.currentBidderId())) {
        var pass = TeamAuctionBidEvent.pass(next.currentLotIndex() + 1, currentId);
        next = next.toBuilder()
            .passedPlayerIds(appended(next.passedPlayerIds(), currentId))
            .bidHistory(appended(next.bidHistory(), pass))
            .build();
      }
      next = next.toBuilder().roundEndsAt(null).turnIndex(nextTurnIndex(next)).build();
      checked += 1;
      var snapshot = next;
      boolean anyActive = snapshot.turnOrder().stream()
          .anyMatch(playerId -> !snapshot.passedPlayerIds().contains(playerId)
              && !playerId.equals(snapshot.currentBidderId()) && eligibleForLot(snapshot, playerId, context));
      if (!anyActive) return settleLot(next, context);
    }
    return settleLot(next, context);
  }

  /** {@code playerId} pasa en su turno, por acción o al vencer el plazo. */
  private static PokemonTeamAuctionState passTurn(PokemonTeamAuctionState state, String playerId,
      GameContext context) {
    var pass = TeamAuctionBidEvent.pass(state.currentLotIndex() + 1, playerId);
    return normalizeTurn(state.toBuilder()
        .roundEndsAt(null)
        .passedPlayerIds(appended(state.passedPlayerIds(), playerId))
        .bidHistory(appended(state.bidHistory(), pass))
        .turnIndex(nextTurnIndex(state))
        .build(), context);
  }

  /** Seis lotes por jugador; consume {@code random} al barajar el pool. */
  @Override
  public PokemonTeamAuctionState createInitialState(PokemonTeamAuctionConfig config, GameContext context) {
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var lots = poolFor(context, config, playerIds.size() * TEAM_SIZE);
    var participants = new LinkedHashMap<String, TeamAuctionParticipant>();
    for (var playerId : playerIds) {
      participants.put(playerId, new TeamAuctionParticipant(config.initialBudget(), List.of(), playerId));
    }
    var playerStats = new LinkedHashMap<String, TeamAuctionPlayerStats>();
    var scores = new LinkedHashMap<String, Integer>();
    for (var playerId : playerIds) {
      playerStats.put(playerId, PokemonTeamAuctionRules.participantStats(participants.get(playerId), 0, 0));
      scores.put(playerId, 0);
    }
    return PokemonTeamAuctionState.builder()
        .roundEndsAt(null)
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .lots(lots)
        .currentLotIndex(-1)
        .currentBid(null)
        .currentBidderId(null)
        .turnOrder(List.of())
        .turnIndex(0)
        .passedPlayerIds(List.of())
        .bidHistory(List.of())
        .lotHistory(List.of())
        .participants(participants)
        .playerStats(playerStats)
        .scores(scores)
        .results(null)
        .build();
  }

  @Override
  public PokemonTeamAuctionState start(PokemonTeamAuctionState state, GameContext context) {
    return beginLot(state, 0, context);
  }

  @Override
  public GameActionResult<PokemonTeamAuctionState> handleAction(PokemonTeamAuctionState state, String playerId,
      PokemonTeamAuctionAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La subasta ya ha terminado.");
    if (Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo de puja ha terminado.");
    }
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta subasta.");
    }
    if (!playerId.equals(currentTurnPlayerId(state))) return GameActionResult.reject(state, "No es tu turno.");
    var current = participant(state, playerId);
    if (current == null || current.team().size() >= TEAM_SIZE) {
      return GameActionResult.reject(state, "Tu equipo ya está completo.");
    }
    if (action instanceof PokemonTeamAuctionAction.RaiseBid raise) {
      int minimum = requiredBid(state);
      if (raise.amount() < minimum) return GameActionResult.reject(state, "La puja mínima es " + minimum + ".");
      if (raise.amount() > current.coins()) {
        return GameActionResult.reject(state, "No tienes suficientes monedas para esa puja.");
      }
      var bid = TeamAuctionBidEvent.bid(state.currentLotIndex() + 1, playerId, raise.amount());
      var next = state.toBuilder()
          .roundEndsAt(null)
          .currentBid(raise.amount())
          .currentBidderId(playerId)
          .bidHistory(appended(state.bidHistory(), bid))
          .turnIndex(nextTurnIndex(state))
          .build();
      return GameActionResult.accept(normalizeTurn(next, context));
    }
    return GameActionResult.accept(passTurn(state, playerId, context));
  }

  @Override
  public PokemonTeamAuctionState handleTimeout(PokemonTeamAuctionState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || !Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return state;
    }
    var playerId = currentTurnPlayerId(state);
    if (playerId == null) return normalizeTurn(state, context);
    return passTurn(state, playerId, context);
  }

  @Override
  public PokemonTeamAuctionState handlePresenceChange(PokemonTeamAuctionState state, GameContext context) {
    return state.phase() == GamePhase.ROUND_ACTIVE ? normalizeTurn(state, context) : state;
  }

  @Override
  public PokemonTeamAuctionPublicState getPublicState(PokemonTeamAuctionState state, GameContext context) {
    var scores = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      var current = state.participants().get(playerId);
      scores.put(playerId,
          current == null ? 0 : current.team().stream().mapToInt(TeamAuctionPokemon::baseStatTotal).sum());
    }
    GameResults results = null;
    if (state.phase() == GamePhase.GAME_RESULTS) {
      results = state.results() != null ? state.results() : PokemonTeamAuctionRules.buildTeamAuctionResults(state);
    }
    var lot = currentLot(state);
    return new PokemonTeamAuctionPublicState(state.roundEndsAt(), ID, state.phase(), state.currentLotIndex() + 1,
        state.lots().size(), lot == null ? null : TeamAuctionLotPokemon.of(lot), state.currentBid(), requiredBid(state), state.currentBidderId(),
        currentTurnPlayerId(state), state.turnOrder(), state.passedPlayerIds(), state.bidHistory(),
        state.lotHistory(), state.participants(), scores, results);
  }

  @Override
  public PokemonTeamAuctionPlayerState getPlayerState(PokemonTeamAuctionState state, String playerId,
      GameContext context) {
    var current = participant(state, playerId);
    if (current == null || !state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return PokemonTeamAuctionPlayerState.spectator(requiredBid(state));
    }
    boolean onTurn = state.phase() == GamePhase.ROUND_ACTIVE && playerId.equals(currentTurnPlayerId(state))
        && !state.passedPlayerIds().contains(playerId);
    boolean canAct = onTurn && current.team().size() < TEAM_SIZE && current.coins() >= requiredBid(state)
        && !playerId.equals(state.currentBidderId());
    return new PokemonTeamAuctionPlayerState("PLAYER", canAct, onTurn && !playerId.equals(state.currentBidderId()),
        requiredBid(state), current.coins(), current.team());
  }

  @Override
  public GameLifecycle getLifecycle(PokemonTeamAuctionState state) {
    // timedGameLifecycle({ ...state, turnNumber: state.bidHistory.length }).
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .turnNumber(state.bidHistory().size())
        .turnIndex(state.turnIndex())
        .currentLotIndex(state.currentLotIndex())
        .build();
  }

  @Override
  public boolean isFinished(PokemonTeamAuctionState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokemonTeamAuctionState state) {
    return PokemonTeamAuctionRules.buildTeamAuctionResults(state);
  }
}
