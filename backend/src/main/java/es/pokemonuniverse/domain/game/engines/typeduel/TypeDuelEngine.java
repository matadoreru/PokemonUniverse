package es.pokemonuniverse.domain.game.engines.typeduel;

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
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelAction;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelAttempt;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelCoopFind;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelPlayerState;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelPublicState;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelRoundReason;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelRoundResult;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelSolution;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelState;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelStats;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Traducción literal del TS que antes estaba en {@code type-duel/server.ts}; {@code handleTimeout} es propio (cinco
 * fases temporizadas).
 */
public final class TypeDuelEngine
    implements GameEngine<TypeDuelConfig, TypeDuelState, TypeDuelAction, TypeDuelPublicState> {

  public static final String ID = "type-duel";
  private static final long TYPE_REVEAL_MS = 2_000;
  private static final long INVALID_COMBINATION_MS = 3_000;
  public static final long RESULT_MS = 10_000;
  /** {@code COOP}: el Pokémon ya está en la lista del grupo (lo encontrara quien lo encontrase). */
  public static final String COOP_DUPLICATE_MESSAGE = "Ya lo ha encontrado alguien.";

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public TypeDuelEngine(GameManifest manifest) {
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
  public TypeDuelConfig parseConfig(JsonNode raw) {
    return TypeDuelConfig.parse(raw);
  }

  @Override
  public TypeDuelAction parseAction(JsonNode raw) {
    return TypeDuelAction.parse(raw);
  }

  @Override
  public TypeDuelConfig defaultConfig() {
    return TypeDuelConfig.defaults();
  }

  /** Consume {@code random} una vez (elección de pareja) salvo que queden menos de dos jugadores y la partida acabe. */
  private static TypeDuelState selectPlayers(TypeDuelState state, GameContext context) {
    var availablePlayerIds = context.connectedRequiredPlayerIds(state.playerIds());
    if (availablePlayerIds.size() < 2) return state.finished();
    var participants = TypeDuelRules.chooseBalancedPair(availablePlayerIds, state.participationCounts(),
        state.lastPair(), context.random());
    var counts = new LinkedHashMap<>(state.participationCounts());
    for (var id : participants) counts.put(id, counts.getOrDefault(id, 0) + 1);
    return state.toBuilder()
        .phase(GamePhase.SELECTING_TYPES)
        .selectionCycles(state.selectionCycles() + 1)
        .roundNumber(state.completedRounds() + 1)
        .participants(participants)
        .participationCounts(counts)
        .lastPair(participants)
        .typeSelections(Map.of())
        .requiredTypes(null)
        .invalidCombinations(0)
        .validPokemonIds(List.of())
        .attempts(List.of())
        .cooldownUntil(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().typeSelectSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  /** Las formas regionales cuentan como solución ({@code includeForms: true}). */
  private static TypeDuelState resolveTypes(TypeDuelState state, GameContext context) {
    var typeA = state.typeSelections().get(state.participants().get(0));
    var typeB = state.typeSelections().get(state.participants().get(1));
    var valid = context.pokemon().forGenerations(state.config().generations(), true).stream()
        .filter(pokemon -> TypeDuelRules.isValidPokemonForTypes(pokemon, typeA, typeB))
        .toList();
    boolean any = !valid.isEmpty();
    return state.toBuilder()
        .phase(any ? GamePhase.TYPE_REVEAL : GamePhase.INVALID_COMBINATION)
        .requiredTypes(TypeDuelRules.requiredTypeCombination(typeA, typeB))
        .invalidCombinations(any ? state.invalidCombinations() : state.invalidCombinations() + 1)
        .validPokemonIds(valid.stream().map(pokemon -> pokemon.id()).toList())
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + (any ? TYPE_REVEAL_MS : INVALID_COMBINATION_MS))
        .build();
  }

  private static TypeDuelState beginSearch(TypeDuelState state, GameContext context) {
    return state.toBuilder()
        .phase(GamePhase.POKEMON_SEARCH)
        .attempts(List.of())
        .cooldownUntil(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().searchSeconds() * 1_000L)
        .nextTransitionAt(null)
        .build();
  }

  private static TypeDuelState roundResult(TypeDuelState state, GameContext context, TypeDuelRoundReason reason,
      @Nullable String winnerId) {
    // Toda resolución consume duelo; las estadísticas cuentan los duelos disputados, también los ganados por abandono.
    boolean played = reason == TypeDuelRoundReason.WINNER || reason == TypeDuelRoundReason.TIMEOUT
        || reason == TypeDuelRoundReason.TYPE_FORFEIT || reason == TypeDuelRoundReason.DISCONNECT_FORFEIT;
    int completed = state.completedRounds() + 1;
    var stats = new LinkedHashMap<>(state.playerStats());
    var scores = new LinkedHashMap<>(state.scores());
    if (played) {
      for (var id : state.participants()) {
        stats.put(id, Objects.requireNonNull(stats.get(id), "playerStats").afterDuel(id.equals(winnerId)));
      }
    }
    if (winnerId != null) scores.put(winnerId, scores.getOrDefault(winnerId, 0) + TypeDuelRules.WIN_POINTS);
    var winningPokemonIds = new HashSet<String>();
    for (var attempt : state.attempts()) {
      if (attempt.correct()) winningPokemonIds.add(attempt.pokemonId());
    }
    boolean showSolutions = reason == TypeDuelRoundReason.TIMEOUT || reason == TypeDuelRoundReason.WINNER;
    List<TypeDuelSolution> solutions = showSolutions
        ? state.validPokemonIds().stream()
            .filter(id -> !winningPokemonIds.contains(id))
            .limit(TypeDuelRules.MAX_SOLUTIONS)
            .map(id -> context.pokemon().byId(id).orElseThrow(() -> new EngineException("Pokémon desconocido: " + id)))
            .map(pokemon -> new TypeDuelSolution(pokemon.id(), pokemon.name(), pokemon.sprite()))
            .toList()
        : List.of();
    List<String> disconnectedIds = reason == TypeDuelRoundReason.DISCONNECTED
        || reason == TypeDuelRoundReason.DISCONNECT_FORFEIT
        ? state.participants().stream().filter(id -> !context.isPlayerRequired(id)).toList()
        : List.of();
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .completedRounds(completed)
        .scores(scores)
        .playerStats(stats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + RESULT_MS)
        .lastRound(new TypeDuelRoundResult(reason, winnerId, new ArrayList<>(state.attempts()), solutions,
            state.requiredTypes(), new LinkedHashMap<>(state.typeSelections()), disconnectedIds))
        .build();
  }

  private static boolean coop(TypeDuelState state) {
    return state.config().mode() == TypeDuelMode.COOP;
  }

  /**
   * {@code COOP}: toda la sala busca a la vez los Pokémon de una combinación sorteada entre las que tienen alguno en
   * las generaciones elegidas (primero las que aún no han salido). Consume {@code random} una vez; sin ninguna
   * combinación posible, la partida termina.
   */
  private static TypeDuelState startCoopRound(TypeDuelState state, GameContext context) {
    var pool = context.pokemon().forGenerations(state.config().generations(), true);
    var combinations = TypeDuelRules.coopCombinations(pool);
    if (combinations.isEmpty()) return state.finished();
    var unused = combinations.stream()
        .filter(combination -> !state.usedCombinations().contains(TypeDuelRules.combinationKey(combination)))
        .toList();
    var combination = Randoms.randomItem(unused.isEmpty() ? combinations : unused, context.random());
    var used = new ArrayList<>(state.usedCombinations());
    used.add(TypeDuelRules.combinationKey(combination));
    return state.toBuilder()
        .phase(GamePhase.POKEMON_SEARCH)
        .roundNumber(state.completedRounds() + 1)
        .typeSelections(Map.of())
        .requiredTypes(combination)
        .validPokemonIds(pool.stream().filter(pokemon -> TypeDuelRules.matchesCombination(pokemon, combination))
            .map(pokemon -> pokemon.id()).toList())
        .attempts(List.of())
        .cooldownUntil(Map.of())
        .coopFound(List.of())
        .usedCombinations(used)
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().coopSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  /** {@code COOP}: cierra la búsqueda; las soluciones son las que nadie encontró. Nadie gana la ronda. */
  private static TypeDuelState coopRoundResult(TypeDuelState state, GameContext context, TypeDuelRoundReason reason) {
    var foundIds = new HashSet<String>();
    for (var find : state.coopFound()) foundIds.add(find.pokemonId());
    List<TypeDuelSolution> missed = state.validPokemonIds().stream()
        .filter(id -> !foundIds.contains(id))
        .limit(TypeDuelRules.MAX_SOLUTIONS)
        .map(id -> context.pokemon().byId(id).orElseThrow(() -> new EngineException("Pokémon desconocido: " + id)))
        .map(pokemon -> new TypeDuelSolution(pokemon.id(), pokemon.name(), pokemon.sprite()))
        .toList();
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .completedRounds(state.completedRounds() + 1)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + RESULT_MS)
        .lastRound(new TypeDuelRoundResult(reason, null, new ArrayList<>(state.attempts()), missed,
            state.requiredTypes(), Map.of(), List.of()))
        .build();
  }

  /**
   * {@code COOP}: cualquier jugador de la partida busca. Las acciones de la sala llegan de una en una, así que de dos
   * jugadores que dicen el mismo Pokémon «a la vez» cuenta el primero y el segundo recibe
   * {@link #COOP_DUPLICATE_MESSAGE} sin cambiar el estado (ni espera ni intento).
   */
  private static GameActionResult<TypeDuelState> coopAction(TypeDuelState state, String playerId,
      TypeDuelAction action, GameContext context) {
    if (!state.playerIds().contains(playerId)) return GameActionResult.reject(state, "Observas esta partida.");
    if (!context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    if (!(action instanceof TypeDuelAction.AttemptPokemon attemptAction)) {
      return GameActionResult.reject(state, "No se están eligiendo tipos.");
    }
    if (state.phase() != GamePhase.POKEMON_SEARCH) return GameActionResult.reject(state, "La carrera no está activa.");
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var lookup = context.pokemon().byId(attemptAction.pokemonId());
    if (lookup.isEmpty() || !state.config().generations().contains(lookup.get().generation())) {
      return GameActionResult.reject(state, "Pokémon fuera del pool.");
    }
    var pokemon = lookup.get();
    if (state.coopFound().stream().anyMatch(find -> find.pokemonId().equals(pokemon.id()))) {
      return GameActionResult.reject(state, COOP_DUPLICATE_MESSAGE);
    }
    if (state.attempts().stream()
        .anyMatch(prev -> prev.playerId().equals(playerId) && prev.pokemonId().equals(pokemon.id()))) {
      return GameActionResult.reject(state, "Ya lo probaste.");
    }
    boolean correct = state.validPokemonIds().contains(pokemon.id());
    var attempts = new ArrayList<>(state.attempts());
    attempts.add(new TypeDuelAttempt(playerId, pokemon.id(), pokemon.name(), pokemon.sprite(), correct, context.now()));
    // Las estadísticas de duelo (`playerStats`) no se tocan en COOP: lo que cuenta es la aportación.
    var next = state.toBuilder().attempts(attempts);
    if (!correct) {
      return GameActionResult.accept(next
          .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(),
              TypeDuelRules.ATTEMPT_COOLDOWN_MS))
          .build());
    }
    var found = new ArrayList<>(state.coopFound());
    found.add(new TypeDuelCoopFind(pokemon.id(), playerId, pokemon.name(), pokemon.sprite()));
    var contributions = new LinkedHashMap<>(state.contributions());
    contributions.put(playerId, contributions.getOrDefault(playerId, 0) + 1);
    var scores = new LinkedHashMap<>(state.scores());
    scores.put(playerId, scores.getOrDefault(playerId, 0) + 1);
    var updated = next.coopFound(found).contributions(contributions).scores(scores).build();
    // Todo encontrado: la ronda acaba sin esperar al reloj.
    return GameActionResult.accept(found.size() >= state.validPokemonIds().size()
        ? coopRoundResult(updated, context, TypeDuelRoundReason.ALL_FOUND) : updated);
  }

  private static TypeDuelState advanceAfterResult(TypeDuelState state, GameContext context) {
    if (coop(state)) {
      return state.completedRounds() >= state.config().rounds() ? state.finished() : startCoopRound(state, context);
    }
    // Tope duro: como mucho rounds × 2 entradas en SELECTING_TYPES, reintentos incluidos.
    boolean done = state.completedRounds() >= state.config().rounds()
        || state.selectionCycles() >= state.config().rounds() * 2;
    return done ? state.finished() : selectPlayers(state, context);
  }

  @Override
  public TypeDuelState createInitialState(TypeDuelConfig config, GameContext context) {
    if (context.players().size() < 2) throw new EngineException("Se necesitan dos jugadores.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var participationCounts = new LinkedHashMap<String, Integer>();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, TypeDuelStats>();
    var contributions = new LinkedHashMap<String, Integer>();
    for (var id : playerIds) {
      participationCounts.put(id, 0);
      scores.put(id, 0);
      playerStats.put(id, TypeDuelStats.ZERO);
      contributions.put(id, 0);
    }
    return TypeDuelState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .completedRounds(0)
        .roundNumber(0)
        .participants(List.of(playerIds.get(0), playerIds.get(1)))
        .participationCounts(participationCounts)
        .scores(scores)
        .playerStats(playerStats)
        .contributions(contributions)
        .build();
  }

  @Override
  public TypeDuelState start(TypeDuelState state, GameContext context) {
    return coop(state) ? startCoopRound(state, context) : selectPlayers(state, context);
  }

  @Override
  public GameActionResult<TypeDuelState> handleAction(TypeDuelState state, String playerId, TypeDuelAction action,
      GameContext context) {
    if (action instanceof TypeDuelAction.Continue) {
      if (state.phase() != GamePhase.ROUND_RESULTS) {
        return GameActionResult.reject(state, "No hay ningún resultado que avanzar.");
      }
      if (!context.isHost(playerId)) {
        return GameActionResult.reject(state, "Solo el Host puede avanzar la ronda.");
      }
      return GameActionResult.accept(advanceAfterResult(state, context));
    }
    if (coop(state)) return coopAction(state, playerId, action, context);
    if (!state.participants().contains(playerId)) return GameActionResult.reject(state, "Observas este duelo.");
    if (!context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    if (action instanceof TypeDuelAction.SelectType select) {
      if (state.phase() != GamePhase.SELECTING_TYPES) {
        return GameActionResult.reject(state, "No se están eligiendo tipos.");
      }
      if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
        return GameActionResult.reject(state, "El tiempo ha terminado.");
      }
      if (state.typeSelections().containsKey(playerId)) {
        return GameActionResult.reject(state, "Tu tipo ya está bloqueado.");
      }
      var selections = new LinkedHashMap<>(state.typeSelections());
      selections.put(playerId, select.pokemonType());
      var next = state.toBuilder().typeSelections(selections).build();
      if (next.participants().stream().allMatch(next.typeSelections()::containsKey)) next = resolveTypes(next, context);
      return GameActionResult.accept(next);
    }
    var attemptAction = (TypeDuelAction.AttemptPokemon) action;
    if (state.phase() != GamePhase.POKEMON_SEARCH) return GameActionResult.reject(state, "La carrera no está activa.");
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var found = context.pokemon().byId(attemptAction.pokemonId());
    if (found.isEmpty() || !state.config().generations().contains(found.get().generation())) {
      return GameActionResult.reject(state, "Pokémon fuera del pool.");
    }
    var pokemon = found.get();
    if (state.attempts().stream()
        .anyMatch(prev -> prev.playerId().equals(playerId) && prev.pokemonId().equals(pokemon.id()))) {
      return GameActionResult.reject(state, "Ya lo probaste.");
    }
    boolean correct = state.validPokemonIds().contains(pokemon.id());
    var attempt = new TypeDuelAttempt(playerId, pokemon.id(), pokemon.name(), pokemon.sprite(), correct, context.now());
    var prior = Objects.requireNonNull(state.playerStats().get(playerId), "playerStats");
    var attempts = new ArrayList<>(state.attempts());
    attempts.add(attempt);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    long elapsed = context.now() - (state.roundStartedAt() == null ? context.now() : state.roundStartedAt());
    playerStats.put(playerId, prior.afterAttempt(correct, elapsed));
    var next = state.toBuilder()
        .attempts(attempts)
        .cooldownUntil(correct ? state.cooldownUntil()
            : Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(), TypeDuelRules.ATTEMPT_COOLDOWN_MS))
        .playerStats(playerStats)
        .build();
    if (correct) next = roundResult(next, context, TypeDuelRoundReason.WINNER, playerId);
    return GameActionResult.accept(next);
  }

  @Override
  public TypeDuelState handleTimeout(TypeDuelState state, GameContext context) {
    if (coop(state)) {
      if (state.phase() == GamePhase.POKEMON_SEARCH && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
        return coopRoundResult(state, context, TypeDuelRoundReason.TIMEOUT);
      }
      if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
        return advanceAfterResult(state, context);
      }
      return state;
    }
    if (state.phase() == GamePhase.SELECTING_TYPES && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      var playersWhoSelected = state.participants().stream().filter(state.typeSelections()::containsKey).toList();
      return playersWhoSelected.size() == 1
          ? roundResult(state, context, TypeDuelRoundReason.TYPE_FORFEIT, playersWhoSelected.getFirst())
          : roundResult(state, context, TypeDuelRoundReason.TYPE_TIMEOUT, null);
    }
    if (state.phase() == GamePhase.TYPE_REVEAL && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginSearch(state, context);
    }
    if (state.phase() == GamePhase.INVALID_COMBINATION && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      if (state.invalidCombinations() >= TypeDuelRules.TYPE_DUEL_MAX_INVALID_COMBINATIONS
          || state.selectionCycles() >= state.config().rounds() * 2) {
        return roundResult(state, context, TypeDuelRoundReason.INVALID_COMBINATION, null);
      }
      return state.toBuilder()
          .phase(GamePhase.SELECTING_TYPES)
          .selectionCycles(state.selectionCycles() + 1)
          .typeSelections(Map.of())
          .requiredTypes(null)
          .validPokemonIds(List.of())
          .roundStartedAt(context.now())
          .roundEndsAt(context.now() + state.config().typeSelectSeconds() * 1_000L)
          .nextTransitionAt(null)
          .build();
    }
    if (state.phase() == GamePhase.POKEMON_SEARCH && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return roundResult(state, context, TypeDuelRoundReason.TIMEOUT, null);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return advanceAfterResult(state, context);
    }
    return state;
  }

  @Override
  public TypeDuelState handlePresenceChange(TypeDuelState state, GameContext context) {
    // COOP: no hay duelo que perder por abandono; la búsqueda sigue hasta el reloj.
    if (coop(state)) return state;
    var phase = state.phase();
    if (phase == GamePhase.SELECTING_TYPES || phase == GamePhase.TYPE_REVEAL
        || phase == GamePhase.INVALID_COMBINATION || phase == GamePhase.POKEMON_SEARCH) {
      // La sala solo avisa cuando vence la gracia de presencia: la ausencia ya es definitiva.
      List<String> absent = state.participants().stream().filter(playerId -> !context.isPlayerRequired(playerId))
          .toList();
      if (absent.size() == 1) {
        String rival = state.participants().stream().filter(playerId -> !playerId.equals(absent.getFirst()))
            .findFirst().orElseThrow();
        return roundResult(state, context, TypeDuelRoundReason.DISCONNECT_FORFEIT, rival);
      }
      if (absent.size() == 2) return roundResult(state, context, TypeDuelRoundReason.DISCONNECTED, null);
    }
    return state;
  }

  @Override
  public TypeDuelPublicState getPublicState(TypeDuelState state, GameContext context) {
    boolean coop = coop(state);
    // COOP: no hay tipos elegidos que revelar; la combinación sale en `combination`.
    boolean reveal = !coop && state.participants().stream().allMatch(state.typeSelections()::containsKey)
        && state.phase() != GamePhase.SELECTING_TYPES;
    boolean resultsPhase = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    // Cuántos Pokémon cumplen la combinación (nunca cuáles), solo mientras se revela y se busca; en COOP, también en el
    // resultado de la ronda (el contador del grupo).
    Integer solutionCount = state.phase() == GamePhase.TYPE_REVEAL || state.phase() == GamePhase.POKEMON_SEARCH
        || coop && state.phase() == GamePhase.ROUND_RESULTS
        ? state.validPokemonIds().size() : null;
    return new TypeDuelPublicState(ID, state.phase(), state.config().mode(), state.playerIds(), state.completedRounds(), state.roundNumber(),
        state.config().rounds(), state.participants(), state.participationCounts(),
        new ArrayList<>(state.typeSelections().keySet()),
        reveal ? state.typeSelections() : Map.of(),
        reveal ? state.requiredTypes() : null,
        solutionCount,
        state.invalidCombinations(),
        state.selectionCycles() >= state.config().rounds() * 2,
        state.attempts(), state.scores(), state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        resultsPhase ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? TypeDuelRules.buildTypeDuelResults(state) : null,
        coop ? state.requiredTypes() : null,
        coop ? state.coopFound() : null,
        coop ? state.contributions() : null);
  }

  @Override
  public TypeDuelPlayerState getPlayerState(TypeDuelState state, String playerId, GameContext context) {
    if (coop(state)) {
      // COOP: participa toda la partida; no hay tipo propio.
      boolean player = state.playerIds().contains(playerId);
      var cooldown = state.cooldownUntil().get(playerId);
      return new TypeDuelPlayerState(player, null, false, player && state.phase() == GamePhase.POKEMON_SEARCH,
          cooldown == null ? 0 : cooldown);
    }
    boolean participant = state.participants().contains(playerId);
    var cooldown = state.cooldownUntil().get(playerId);
    return new TypeDuelPlayerState(participant, state.typeSelections().get(playerId),
        participant && state.phase() == GamePhase.SELECTING_TYPES && !state.typeSelections().containsKey(playerId),
        participant && state.phase() == GamePhase.POKEMON_SEARCH,
        cooldown == null ? 0 : cooldown);
  }

  @Override
  public GameLifecycle getLifecycle(TypeDuelState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(TypeDuelState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(TypeDuelState state) {
    return TypeDuelRules.buildTypeDuelResults(state);
  }
}
