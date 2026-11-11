package es.pokemonuniverse.domain.game.engines.pokedexdistance;

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
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceConfig.SelectionVisibility;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.DistanceRoundRecord;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.EliminationReason;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.EliminationRecord;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PlayerRoundStats;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PlayerSelection;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceAction;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistancePlayerState;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistancePublicState;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceState;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PublicActiveSelection;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PublicRoundResult;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PublicSelection;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.RoundReason;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.RoundResult;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.RoundSelection;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.TargetPokemon;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/** Traducción literal del TS que antes estaba en {@code pokedex-distance/server.ts}. */
public final class PokedexDistanceEngine implements
    GameEngine<PokedexDistanceConfig, PokedexDistanceState, PokedexDistanceAction, PokedexDistancePublicState> {

  public static final String ID = "pokedex-distance";
  private static final long RESULTS_DURATION_MS = 6_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokedexDistanceEngine(GameManifest manifest) {
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
  public PokedexDistanceConfig parseConfig(JsonNode raw) {
    return PokedexDistanceConfig.parse(raw);
  }

  @Override
  public PokedexDistanceAction parseAction(JsonNode raw) {
    return PokedexDistanceAction.parse(raw);
  }

  @Override
  public PokedexDistanceConfig defaultConfig() {
    return PokedexDistanceConfig.defaults();
  }

  private static boolean isActive(GamePhase phase) {
    return phase == GamePhase.ROUND_ACTIVE || phase == GamePhase.TIEBREAKER_ACTIVE;
  }

  /** Consume {@code random} exactamente una vez ({@code Math.min(Math.floor(r * n), n - 1)} es {@code randomItem}). */
  private static int selectTarget(PokedexDistanceState state, GameContext context) {
    var pool = context.pokemon().forGenerations(state.config().generations());
    if (pool.isEmpty()) throw new EngineException("The selected generations have no Pokémon");
    return Randoms.randomItem(pool, context.random()).nationalDexNumber();
  }

  private static PokedexDistanceState beginRound(PokedexDistanceState state, GameContext context,
      List<String> eligibleIds, int tiebreakDepth) {
    boolean isTiebreak = tiebreakDepth > 0;
    return state.toBuilder()
        .phase(isTiebreak ? GamePhase.TIEBREAKER_ACTIVE : GamePhase.ROUND_ACTIVE)
        .roundNumber(isTiebreak ? state.roundNumber() : state.roundNumber() + 1)
        .tiebreakDepth(tiebreakDepth)
        .eligibleIds(eligibleIds)
        .targetDexNumber(selectTarget(state, context))
        .selections(Map.of())
        .lockedPokemonIds(List.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .lastRound(null)
        .nextTransitionAt(null)
        .pendingEligibleIds(List.of())
        .pendingTiebreakDepth(0)
        .build();
  }

  private static PokedexDistanceState finishIfWinner(PokedexDistanceState state) {
    if (state.survivorIds().size() > 1) return state;
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .winnerId(state.survivorIds().isEmpty() ? null : state.survivorIds().getFirst())
        .eligibleIds(List.of())
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .build();
  }

  private static PokedexDistanceState eliminateAndContinue(PokedexDistanceState state, List<String> playerIds,
      EliminationReason reason, GameContext context, RoundResult roundResult) {
    Set<String> eliminatedSet = Set.copyOf(playerIds);
    var survivorIds = state.survivorIds().stream().filter(id -> !eliminatedSet.contains(id)).toList();
    var spectatorIds = new LinkedHashSet<>(state.spectatorIds());
    spectatorIds.addAll(playerIds);
    var eliminations = new ArrayList<EliminationRecord>(state.eliminations());
    eliminations.add(PokedexDistanceRules.elimination(playerIds, reason, state));
    var history = new ArrayList<DistanceRoundRecord>(state.roundHistory());
    history.add(PokedexDistanceRules.roundRecord(state, playerIds));
    // Supera el desempate quien lo jugaba y no cae; un desempate que vuelve a empatar no pasa por aquí.
    Set<String> wonTiebreak = state.tiebreakDepth() > 0 ? Set.copyOf(state.eligibleIds()) : Set.of();
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var id : survivorIds) {
      playerStats.put(id, playerStats.getOrDefault(id, PokedexDistanceRules.emptyPlayerStats())
          .afterSurvival(wonTiebreak.contains(id)));
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .survivorIds(survivorIds)
        .spectatorIds(new ArrayList<>(spectatorIds))
        .lastRound(roundResult)
        .eliminations(eliminations)
        .roundHistory(history)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + RESULTS_DURATION_MS)
        .pendingEligibleIds(survivorIds)
        .pendingTiebreakDepth(0)
        .playerStats(playerStats)
        .build();
  }

  private static boolean pointsMode(PokedexDistanceState state) {
    return state.config().mode() == PokedexDistanceMode.POINTS;
  }

  /**
   * Ronda de {@code POINTS}: cada elegible suma sus puntos (0 sin elección) y nadie cae; sin desempates. Es el único
   * sitio donde cambia {@code scores}: al elegir no se mueve, para no adelantar distancias ocultas.
   */
  private static PokedexDistanceState scoreRound(PokedexDistanceState state, GameContext context) {
    int targetDexNumber = Objects.requireNonNull(state.targetDexNumber(), "targetDexNumber");
    var points = PokedexDistanceRules.roundPoints(state);
    var scores = new LinkedHashMap<>(state.scores());
    points.forEach((id, value) -> scores.merge(id, value, Integer::sum));
    var history = new ArrayList<DistanceRoundRecord>(state.roundHistory());
    history.add(PokedexDistanceRules.roundRecord(state, List.of()));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .lastRound(new RoundResult(targetDexNumber, state.selections(), List.of(), RoundReason.SCORED, List.of(), points))
        .roundHistory(history)
        .scores(scores)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + RESULTS_DURATION_MS)
        .pendingEligibleIds(state.initialPlayerIds())
        .pendingTiebreakDepth(0)
        .build();
  }

  /** Fin de {@code POINTS} tras {@code pointsRounds} rondas: gana el líder único por puntos, o nadie si empatan. */
  private static PokedexDistanceState finishPoints(PokedexDistanceState state) {
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .winnerId(PokedexDistanceRules.pointsLeader(state.scores()))
        .eligibleIds(List.of())
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .build();
  }

  private static PokedexDistanceState resolveRound(PokedexDistanceState state, GameContext context) {
    if (pointsMode(state)) return scoreRound(state, context);
    int targetDexNumber = Objects.requireNonNull(state.targetDexNumber(), "targetDexNumber");
    var missing = state.eligibleIds().stream().filter(id -> !state.selections().containsKey(id)).toList();
    if (!missing.isEmpty()) {
      return eliminateAndContinue(state, missing, EliminationReason.NO_RESPONSE, context,
          new RoundResult(targetDexNumber, state.selections(), missing, RoundReason.NO_RESPONSE, List.of()));
    }

    var farthest = PokedexDistanceRules.farthestPlayerIds(state.selections());
    if (farthest.size() > 1 && state.tiebreakDepth() >= PokedexDistanceRules.MAX_TIEBREAK_DEPTH) {
      var eliminatedIds = PokedexDistanceRules.lastToSelectIds(state.selections(), farthest);
      return eliminateAndContinue(state, eliminatedIds, EliminationReason.FARTHEST, context,
          new RoundResult(targetDexNumber, state.selections(), eliminatedIds, RoundReason.FARTHEST, farthest));
    }
    if (farthest.size() > 1) {
      var tieResult = new RoundResult(targetDexNumber, state.selections(), List.of(), RoundReason.TIE, farthest);
      var history = new ArrayList<DistanceRoundRecord>(state.roundHistory());
      history.add(PokedexDistanceRules.roundRecord(state, List.of()));
      return state.toBuilder()
          .phase(GamePhase.ROUND_RESULTS)
          .lastRound(tieResult)
          .roundHistory(history)
          .roundEndsAt(null)
          .nextTransitionAt(context.now() + RESULTS_DURATION_MS)
          .pendingEligibleIds(farthest)
          .pendingTiebreakDepth(state.tiebreakDepth() + 1)
          .build();
    }

    if (farthest.isEmpty()) return state;
    var eliminatedId = farthest.getFirst();
    return eliminateAndContinue(state, List.of(eliminatedId), EliminationReason.FARTHEST, context,
        new RoundResult(targetDexNumber, state.selections(), List.of(eliminatedId), RoundReason.FARTHEST, List.of()));
  }

  /** {@code resolveWhenRequiredPlayersComplete} con la fase actual como activa (cubre también el desempate). */
  private static PokedexDistanceState resolveIfComplete(PokedexDistanceState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.eligibleIds(),
        id -> state.selections().containsKey(id), PokedexDistanceEngine::resolveRound, state.phase());
  }

  /**
   * El reto diario juega este modo en solitario; la sala normal sigue exigiendo el {@code minPlayers} del manifiesto.
   */
  int minPlayers(PokedexDistanceConfig config) {
    return config.mode() == PokedexDistanceMode.POINTS ? 1 : manifest.minPlayers();
  }

  /** No consume {@code random}. La configuración ya llega normalizada por {@link #parseConfig}. */
  @Override
  public PokedexDistanceState createInitialState(PokedexDistanceConfig config, GameContext context) {
    int minPlayers = minPlayers(config);
    if (context.players().size() < minPlayers) {
      throw new EngineException("At least " + minPlayers + " players are required");
    }
    if (context.pokemon().forGenerations(config.generations()).size() < context.players().size()) {
      throw new EngineException("The Pokémon pool is too small for this player count");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var playerStats = new LinkedHashMap<String, PlayerRoundStats>();
    for (var id : playerIds) playerStats.put(id, PokedexDistanceRules.emptyPlayerStats());
    var scores = new LinkedHashMap<String, Integer>();
    for (var id : playerIds) scores.put(id, 0);
    return PokedexDistanceState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .initialPlayerIds(playerIds)
        .survivorIds(playerIds)
        .roundNumber(0)
        .tiebreakDepth(0)
        .pendingTiebreakDepth(0)
        .playerStats(playerStats)
        .scores(scores)
        .build();
  }

  @Override
  public PokedexDistanceState start(PokedexDistanceState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("Game already started");
    return beginRound(state, context, state.survivorIds(), 0);
  }

  /** El {@code Unknown action} de TS es inalcanzable: {@link PokedexDistanceAction#parse} solo admite {@code SELECT_POKEMON}. */
  @Override
  public GameActionResult<PokedexDistanceState> handleAction(PokedexDistanceState state, String playerId,
      PokedexDistanceAction action, GameContext context) {
    if (!isActive(state.phase())) return GameActionResult.reject(state, "No active round");
    if (!state.eligibleIds().contains(playerId)) return GameActionResult.reject(state, "You are spectating this round");
    if (state.selections().containsKey(playerId)) return GameActionResult.reject(state, "Selection already locked");
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(resolveRound(state, context), "Round has ended");
    }
    boolean live = state.config().selectionVisibility() == SelectionVisibility.LIVE;
    if (live && state.lockedPokemonIds().contains(action.pokemonId())) {
      return GameActionResult.reject(state, "Ese Pokémon ya ha sido elegido.");
    }
    Optional<Pokemon> found = context.pokemon().byId(action.pokemonId());
    if (found.isEmpty() || !found.get().isDefault()
        || !state.config().generations().contains(found.get().generation())) {
      return GameActionResult.reject(state, "Pokémon is not in the configured pool");
    }
    var pokemon = found.get();

    int distance = PokedexDistanceRules.distanceBetween(pokemon.nationalDexNumber(),
        Objects.requireNonNull(state.targetDexNumber(), "targetDexNumber"));
    var stats = state.playerStats().getOrDefault(playerId, PokedexDistanceRules.emptyPlayerStats());
    var selections = new LinkedHashMap<>(state.selections());
    selections.put(playerId, new RoundSelection(pokemon.id(), pokemon.nationalDexNumber(), distance, context.now()));
    // En HIDDEN no hay bloqueo: dos jugadores pueden elegir el mismo Pokémon y reciben la misma distancia.
    var lockedPokemonIds = new ArrayList<>(state.lockedPokemonIds());
    if (live) lockedPokemonIds.add(pokemon.id());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, stats.afterSelection(distance));
    var next = state.toBuilder()
        .selections(selections)
        .lockedPokemonIds(lockedPokemonIds)
        .playerStats(playerStats)
        .build();
    return GameActionResult.accept(resolveIfComplete(next, context));
  }

  /**
   * Port literal de su {@code handleTimeout}: el TS no usa {@code advanceTimedRound}, que solo admite una fase activa,
   * y aquí son dos ({@code ROUND_ACTIVE} y {@code TIEBREAKER_ACTIVE}). Un plazo nulo es {@code ?? Infinity}: nunca vence.
   */
  @Override
  public PokedexDistanceState handleTimeout(PokedexDistanceState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      if (pointsMode(state)) {
        if (state.roundNumber() >= state.config().pointsRounds()) return finishPoints(state);
        return beginRound(state, context, state.pendingEligibleIds(), 0);
      }
      if (state.survivorIds().size() <= 1) return finishIfWinner(state);
      return beginRound(state, context, state.pendingEligibleIds(), state.pendingTiebreakDepth());
    }
    if (!isActive(state.phase())) return state;
    if (!Timing.deadlineReached(context.now(), state.roundEndsAt())) return state;
    return resolveRound(state, context);
  }

  @Override
  public PokedexDistanceState handlePresenceChange(PokedexDistanceState state, GameContext context) {
    if (!isActive(state.phase())) return state;
    return resolveIfComplete(state, context);
  }

  @Override
  public PokedexDistancePublicState getPublicState(PokedexDistanceState state, GameContext context) {
    // En HIDDEN nadie ve qué han elegido los demás hasta el resultado (también en los desempates); solo quién.
    var selections = new LinkedHashMap<String, PublicActiveSelection>();
    if (state.config().selectionVisibility() == SelectionVisibility.LIVE) {
      state.selections().forEach((playerId, selection) -> {
        var pokemon = context.pokemon().byId(selection.pokemonId());
        selections.put(playerId, new PublicActiveSelection(selection.pokemonId(), selection.selectedAt(),
            pokemon.map(Pokemon::name).orElse("Unknown"), pokemon.map(Pokemon::sprite).orElse("")));
      });
    }
    PublicRoundResult lastRound = null;
    var round = state.lastRound();
    if (round != null) {
      var target = context.pokemon().byDexNumber(round.targetDexNumber())
          .orElseThrow(() -> new EngineException("Round target is missing from the Pokémon catalog"));
      var roundSelections = new LinkedHashMap<String, PublicSelection>();
      round.selections().forEach((playerId, selection) -> {
        var pokemon = context.pokemon().byId(selection.pokemonId());
        roundSelections.put(playerId, new PublicSelection(selection.pokemonId(), selection.dexNumber(),
            selection.distance(), selection.selectedAt(), pokemon.map(Pokemon::name).orElse("Unknown"),
            pokemon.map(Pokemon::sprite).orElse("")));
      });
      lastRound = new PublicRoundResult(round.targetDexNumber(), roundSelections, round.eliminatedIds(), round.reason(),
          round.tiedIds(), state.eligibleIds(),
          new TargetPokemon(target.id(), target.name(), target.nationalDexNumber(), target.sprite()), round.points());
    }
    boolean points = pointsMode(state);
    return PokedexDistancePublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .mode(state.config().mode())
        .roundNumber(state.roundNumber())
        .tiebreakDepth(state.tiebreakDepth())
        .targetDexNumber(state.targetDexNumber())
        .eligibleIds(state.eligibleIds())
        .survivorIds(state.survivorIds())
        .spectatorIds(state.spectatorIds())
        .selections(selections)
        .selectedIds(List.copyOf(state.selections().keySet()))
        .lockedPokemonIds(state.lockedPokemonIds())
        .roundStartedAt(state.roundStartedAt())
        .roundEndsAt(state.roundEndsAt())
        .lastRound(lastRound)
        // Solo al final: las rondas resueltas ya se vieron una a una en `lastRound`.
        .roundHistory(state.phase() == GamePhase.GAME_RESULTS ? state.roundHistory() : List.of())
        .winnerId(state.winnerId())
        .nextTransitionAt(state.nextTransitionAt())
        .results(state.phase() == GamePhase.GAME_RESULTS ? PokedexDistanceRules.buildResults(state) : null)
        // Solo en POINTS: la ronda en curso («N de M») y el marcador, que solo cambia al revelar.
        .pointsRound(points ? state.roundNumber() : null)
        .pointsRounds(points ? state.config().pointsRounds() : null)
        .scores(points ? state.scores() : null)
        .build();
  }

  /** {@code canSelect} no mira la fase, como el TS: un eliminado por NO_RESPONSE la ve {@code true} en los resultados. */
  @Override
  public PokedexDistancePlayerState getPlayerState(PokedexDistanceState state, String playerId, GameContext context) {
    var selection = state.selections().get(playerId);
    return new PokedexDistancePlayerState(
        state.eligibleIds().contains(playerId) && selection == null,
        selection == null ? null : new PlayerSelection(selection.pokemonId(), selection.selectedAt()),
        selection != null && selection.distance() == 0);
  }

  /** {@code timedGameLifecycle} lee de este estado {@code roundNumber}, {@code roundStartedAt} y {@code spectatorIds}. */
  @Override
  public GameLifecycle getLifecycle(PokedexDistanceState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .spectatorIds(state.spectatorIds())
        .build();
  }

  @Override
  public boolean isFinished(PokedexDistanceState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokedexDistanceState state) {
    return PokedexDistanceRules.buildResults(state);
  }
}
