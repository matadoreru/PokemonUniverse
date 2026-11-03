package es.pokemonuniverse.domain.game.engines.learnsetguess;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessAction;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessAttempt;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessPlayerState;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessPublicState;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessSolve;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessSolvedPlayer;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessState;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetMoveGroup;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetMoveHint;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetRoundPokemon;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetRoundResult;
import es.pokemonuniverse.domain.pokemon.GenerationLearnsetSources;
import es.pokemonuniverse.domain.pokemon.LearnsetPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.ResolvedLevelUpMove;
import es.pokemonuniverse.domain.text.Collations;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/** Traducción literal de {@code learnset-guess/server.ts}. */
public final class LearnsetGuessEngine
    implements GameEngine<LearnsetGuessConfig, LearnsetGuessState, LearnsetGuessAction, LearnsetGuessPublicState> {

  public static final String ID = "learnset-guess";
  public static final int LEARNSET_INITIAL_MAX_LEVEL = 15;
  public static final long LEARNSET_HINT_INTERVAL_MS = 7_000;
  public static final long LEARNSET_GUESS_COOLDOWN_MS = 1_000;
  public static final long LEARNSET_RESULT_DURATION_MS = 4_000;

  /** {@code a.level - b.level || a.move.name.localeCompare(b.move.name)}; {@link List#sort} es estable como JS. */
  private static final Comparator<ResolvedLevelUpMove> LEARNSET_ORDER = Comparator
      .comparingInt(ResolvedLevelUpMove::level)
      .thenComparing(entry -> entry.move().name(), Collations.names());

  private static final TimedRoundStrategy<LearnsetGuessState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public LearnsetGuessState beginNext(LearnsetGuessState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public LearnsetGuessState resolveActive(LearnsetGuessState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public LearnsetGuessState finish(LearnsetGuessState state, GameContext context) {
      return finished(state);
    }

    @Override
    public boolean isComplete(LearnsetGuessState state) {
      return state.roundNumber() >= state.config().rounds();
    }

    /**
     * Revela un grupo extra por cada plazo de 7 s ya vencido (varios si el timeout llega tarde) y programa el siguiente
     * solo si quedan grupos y cae antes del cierre de la ronda.
     */
    @Override
    public LearnsetGuessState tickActive(LearnsetGuessState current, GameContext context) {
      if (current.nextTransitionAt() == null || context.now() < current.nextTransitionAt()) return current;
      var groups = groupLearnset(current.learnset());
      int availableExtras = groups.size() - current.initialGroupCount();
      int revealedExtraGroups = current.revealedExtraGroups();
      long deadline = current.nextTransitionAt();
      while (revealedExtraGroups < availableExtras && context.now() >= deadline) {
        revealedExtraGroups += 1;
        deadline += LEARNSET_HINT_INTERVAL_MS;
      }
      boolean beforeEnd = current.roundEndsAt() == null || deadline < current.roundEndsAt();
      Long nextTransitionAt = revealedExtraGroups < availableExtras && beforeEnd ? deadline : null;
      return current.toBuilder().revealedExtraGroups(revealedExtraGroups).nextTransitionAt(nextTransitionAt).build();
    }
  };

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public LearnsetGuessEngine(GameManifest manifest) {
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
  public LearnsetGuessConfig parseConfig(JsonNode raw) {
    return LearnsetGuessConfig.parse(raw);
  }

  @Override
  public LearnsetGuessAction parseAction(JsonNode raw) {
    return LearnsetGuessAction.parse(raw);
  }

  @Override
  public LearnsetGuessConfig defaultConfig() {
    return LearnsetGuessConfig.defaults();
  }

  /** {@code Math.max(...generations)}: el esquema garantiza al menos una generación. */
  public static int learnsetReferenceGeneration(List<Integer> generations) {
    return Collections.max(generations);
  }

  /** {@code isLearnsetPokemonCatalog(context.pokemon)} de TS es {@code instanceof LearnsetPokemonCatalog}. */
  private static LearnsetPokemonCatalog requireLearnsets(GameContext context) {
    if (!(context.pokemon() instanceof LearnsetPokemonCatalog catalog)) {
      throw new EngineException("The Pokémon catalog has no learnset data");
    }
    return catalog;
  }

  /** Grupos por nivel ascendente; dentro de cada nivel, por nombre del movimiento con {@link Collations#names()}. */
  public static List<List<ResolvedLevelUpMove>> groupLearnset(List<ResolvedLevelUpMove> learnset) {
    var sorted = new ArrayList<>(learnset);
    sorted.sort(LEARNSET_ORDER);
    var groups = new TreeMap<Integer, List<ResolvedLevelUpMove>>();
    for (var entry : sorted) groups.computeIfAbsent(entry.level(), level -> new ArrayList<>()).add(entry);
    return List.copyOf(groups.values());
  }

  public static String evolutionHint(int stage, int stages) {
    if (stages <= 1) return "No evoluciona";
    if (stage <= 1) return "Pokémon base · etapa 1 de " + stages;
    if (stage >= stages) return "Evolución final · etapa " + stage + " de " + stages;
    return "Evolución intermedia · etapa " + stage + " de " + stages;
  }

  /** {@code entry.move.names?.es?.trim() || entry.move.name}: un nombre español vacío tras recortar no cuenta. */
  private static LearnsetMoveHint hint(ResolvedLevelUpMove entry, boolean showLevels) {
    var names = entry.move().names();
    var spanish = names == null ? null : names.get("es");
    var spanishName = spanish instanceof String text ? JsStrings.trim(text) : "";
    return new LearnsetMoveHint(entry.moveId(), spanishName.isEmpty() ? entry.move().name() : spanishName,
        showLevels ? entry.level() : null, entry.move().type(), entry.move().category());
  }

  private static int visibleGroupCount(LearnsetGuessState state) {
    return state.initialGroupCount() + state.revealedExtraGroups();
  }

  private static List<List<ResolvedLevelUpMove>> visibleGroups(LearnsetGuessState state) {
    var groups = groupLearnset(state.learnset());
    return groups.subList(0, Math.min(groups.size(), visibleGroupCount(state)));
  }

  private static List<LearnsetMoveGroup> publicGroups(LearnsetGuessState state) {
    boolean showLevels = state.config().showLevels();
    var groups = visibleGroups(state);
    var result = new ArrayList<LearnsetMoveGroup>();
    for (int index = 0; index < groups.size(); index++) {
      var entries = groups.get(index);
      result.add(new LearnsetMoveGroup(showLevels ? entries.getFirst().level() : null,
          entries.stream().map(entry -> hint(entry, showLevels)).toList(),
          Math.max(0, index - state.initialGroupCount() + 1)));
    }
    return result;
  }

  private record Candidate(Pokemon pokemon, List<ResolvedLevelUpMove> learnset) {}

  /** Pokémon por defecto con al menos dos movimientos distintos, uno hasta nivel 15 y, si se pide, evolución. */
  private static List<Candidate> candidatePool(LearnsetGuessState state, GameContext context) {
    var catalog = requireLearnsets(context);
    int reference = state.referenceGeneration();
    var candidates = new ArrayList<Candidate>();
    for (var pokemon : catalog.forGenerations(state.config().generations())) {
      if (!pokemon.isDefault() || pokemon.generation() > reference) continue;
      var learnset = catalog.levelUpMoves(pokemon.id(), reference);
      var moveIds = new HashSet<String>();
      for (var entry : learnset) moveIds.add(entry.moveId());
      if (moveIds.size() < 2) continue;
      if (learnset.stream().noneMatch(entry -> entry.level() <= LEARNSET_INITIAL_MAX_LEVEL)) continue;
      if (state.config().showEvolution() && catalog.evolutionInfo(pokemon.id()).isEmpty()) continue;
      candidates.add(new Candidate(pokemon, learnset));
    }
    return candidates;
  }

  private static LearnsetGuessState beginRound(LearnsetGuessState state, GameContext context) {
    var allCandidates = candidatePool(state, context);
    if (allCandidates.isEmpty()) {
      throw new EngineException(
          "No hay Pokémon con learnsets válidos para esa selección de generaciones. Ejecuta el seed actualizado.");
    }
    List<Candidate> candidates = allCandidates.stream()
        .filter(entry -> !state.usedPokemonIds().contains(entry.pokemon().id()))
        .toList();
    if (candidates.isEmpty()) candidates = allCandidates;
    var selected = Randoms.randomItem(candidates, context.random());
    var groups = groupLearnset(selected.learnset());
    int initialGroupCount = (int) groups.stream()
        .filter(entries -> entries.getFirst().level() <= LEARNSET_INITIAL_MAX_LEVEL)
        .count();
    long roundEndsAt = context.now() + state.config().roundSeconds() * 1_000L;
    boolean hasExtra = groups.size() > initialGroupCount && context.now() + LEARNSET_HINT_INTERVAL_MS < roundEndsAt;
    var catalog = requireLearnsets(context);
    if (context.preloadImage() != null) context.preloadImage().accept(selected.pokemon().sprite());
    var usedPokemonIds = new LinkedHashSet<>(state.usedPokemonIds());
    usedPokemonIds.add(selected.pokemon().id());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .correctPokemonId(selected.pokemon().id())
        .usedPokemonIds(List.copyOf(usedPokemonIds))
        .learnset(selected.learnset())
        .evolutionInfo(catalog.evolutionInfo(selected.pokemon().id()).orElse(null))
        .initialGroupCount(initialGroupCount)
        .revealedExtraGroups(0)
        .attempts(List.of())
        .solves(Map.of())
        .cooldownUntil(Map.of())
        .lastWarning(false)
        .roundStartedAt(context.now())
        .roundEndsAt(roundEndsAt)
        .nextTransitionAt(hasExtra ? context.now() + LEARNSET_HINT_INTERVAL_MS : null)
        .lastRound(null)
        .build();
  }

  private static LearnsetGuessState resolveRound(LearnsetGuessState state, GameContext context) {
    var pokemon = state.correctPokemonId() == null ? null : context.pokemon().byId(state.correctPokemonId()).orElse(null);
    if (pokemon == null) throw new EngineException("Learnset Guess answer is missing from the catalog");
    boolean showLevels = state.config().showLevels();
    var visibleMoves = visibleGroups(state).stream()
        .flatMap(List::stream)
        .map(entry -> hint(entry, showLevels))
        .toList();
    var playerStats = new LinkedHashMap<>(state.playerStats());
    var absentIds = new ArrayList<String>();
    // Solo falla quien debía jugar la ronda: un desconectado no suma missed y queda como ausente en la revelación.
    for (var playerId : state.playerIds()) {
      if (state.solves().containsKey(playerId)) continue;
      if (!context.isPlayerRequired(playerId)) {
        absentIds.add(playerId);
        continue;
      }
      playerStats.put(playerId, playerStats.getOrDefault(playerId, LearnsetGuessPlayerStats.ZERO).afterMiss());
    }
    var lastRound = new LearnsetRoundResult(LearnsetRoundPokemon.of(pokemon), state.referenceGeneration(),
        GenerationLearnsetSources.label(state.referenceGeneration()), visibleMoves,
        state.learnset().stream().map(entry -> hint(entry, showLevels)).toList(), new LinkedHashMap<>(state.solves()),
        absentIds);
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + LEARNSET_RESULT_DURATION_MS)
        .lastRound(lastRound)
        .build();
  }

  /** {@code finish}: conserva intentos y aciertos de la última ronda (siguen en la proyección pública). */
  private static LearnsetGuessState finished(LearnsetGuessState state) {
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .correctPokemonId(null)
        .learnset(List.of())
        .evolutionInfo(null)
        .roundEndsAt(null)
        .nextTransitionAt(null)
        .build();
  }

  /**
   * Último aviso: si alguien ya ha acertado y entre los requeridos falta exactamente uno, la ronda se cierra como mucho
   * {@link LearnsetGuessRules#LAST_WARNING_MS} después. Solo adelanta {@code roundEndsAt} y descarta la pista pendiente
   * que caiga en el nuevo cierre o después.
   */
  private static LearnsetGuessState applyLastWarning(LearnsetGuessState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.roundEndsAt() == null || state.solves().isEmpty()) {
      return state;
    }
    long missing = state.playerIds().stream()
        .filter(context::isPlayerRequired)
        .filter(id -> !state.solves().containsKey(id))
        .count();
    if (missing != 1) return state;
    long roundEndsAt = Math.min(state.roundEndsAt(), context.now() + LearnsetGuessRules.LAST_WARNING_MS);
    Long nextTransitionAt = state.nextTransitionAt() != null && state.nextTransitionAt() >= roundEndsAt
        ? null
        : state.nextTransitionAt();
    return state.toBuilder().lastWarning(true).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).build();
  }

  private static LearnsetGuessState resolveIfComplete(LearnsetGuessState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), LearnsetGuessEngine::resolveRound);
  }

  @Override
  public LearnsetGuessState createInitialState(LearnsetGuessConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("At least " + manifest.minPlayers() + " players are required");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, LearnsetGuessPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, LearnsetGuessPlayerStats.ZERO);
    }
    return LearnsetGuessState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .roundNumber(0)
        .referenceGeneration(learnsetReferenceGeneration(config.generations()))
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public LearnsetGuessState start(LearnsetGuessState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("Game already started");
    return beginRound(state, context);
  }

  /** El {@code Unknown action} de TS es inalcanzable: {@link LearnsetGuessAction#parse} solo admite {@code GUESS_POKEMON}. */
  @Override
  public GameActionResult<LearnsetGuessState> handleAction(LearnsetGuessState state, String playerId,
      LearnsetGuessAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No active round");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    if (state.solves().containsKey(playerId)) return GameActionResult.reject(state, "Ya has acertado esta ronda.");
    if (context.now() >= (state.roundEndsAt() == null ? 0 : state.roundEndsAt())) {
      // El rechazo lleva ya la ronda resuelta, como el TS.
      return GameActionResult.reject(resolveRound(state, context), "El tiempo ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var guessed = context.pokemon().byId(action.pokemonId()).orElse(null);
    if (guessed == null || !guessed.isDefault() || !state.config().generations().contains(guessed.generation())) {
      return GameActionResult.reject(state, "Pokémon no disponible en esta partida.");
    }
    var stats = state.playerStats().getOrDefault(playerId, LearnsetGuessPlayerStats.ZERO);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    if (guessed.id().equals(state.correctPokemonId())) {
      int revealStage = state.revealedExtraGroups();
      int solveOrder = state.solves().size() + 1;
      int points = LearnsetGuessRules.learnsetPoints(revealStage, solveOrder);
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId, new LearnsetGuessSolve(solveOrder, context.now(), revealStage, points));
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + points);
      playerStats.put(playerId, stats.afterSolve(revealStage, points));
      var next = state.toBuilder().solves(solves).scores(scores).playerStats(playerStats).build();
      return GameActionResult.accept(applyLastWarning(resolveIfComplete(next, context), context));
    }
    var attempts = new ArrayList<>(state.attempts());
    attempts.add(LearnsetGuessAttempt.of(playerId, guessed, context.now()));
    playerStats.put(playerId, stats.afterIncorrectGuess());
    return GameActionResult.accept(state.toBuilder()
        .attempts(attempts)
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(),
            LEARNSET_GUESS_COOLDOWN_MS))
        .playerStats(playerStats)
        .build());
  }

  @Override
  public LearnsetGuessState handleTimeout(LearnsetGuessState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public LearnsetGuessState handlePresenceChange(LearnsetGuessState state, GameContext context) {
    return applyLastWarning(resolveIfComplete(state, context), context);
  }

  @Override
  public LearnsetGuessPublicState getPublicState(LearnsetGuessState state, GameContext context) {
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE;
    var evolution = state.evolutionInfo();
    var solvedPlayers = state.solves().entrySet().stream()
        .map(entry -> new LearnsetGuessSolvedPlayer(entry.getKey(), entry.getValue().solveOrder()))
        .sorted(Comparator.comparingInt(LearnsetGuessSolvedPlayer::solveOrder))
        .toList();
    return new LearnsetGuessPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        state.referenceGeneration(), GenerationLearnsetSources.label(state.referenceGeneration()),
        active ? publicGroups(state) : List.of(),
        active && state.config().showEvolution() && evolution != null
            ? evolutionHint(evolution.stage(), evolution.stages())
            : null,
        state.attempts(), solvedPlayers, state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        active && state.lastWarning(),
        state.phase() == GamePhase.ROUND_RESULTS ? state.lastRound() : null, state.scores(),
        state.phase() == GamePhase.GAME_RESULTS ? LearnsetGuessRules.buildLearnsetResults(state) : null);
  }

  @Override
  public LearnsetGuessPlayerState getPlayerState(LearnsetGuessState state, String playerId, GameContext context) {
    var solve = state.solves().get(playerId);
    return new LearnsetGuessPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId) && solve == null,
        solve != null,
        solve == null ? null : solve.solveOrder(),
        state.cooldownUntil().get(playerId),
        solve == null ? 0 : solve.points());
  }

  @Override
  public GameLifecycle getLifecycle(LearnsetGuessState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(LearnsetGuessState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(LearnsetGuessState state) {
    return LearnsetGuessRules.buildLearnsetResults(state);
  }
}
