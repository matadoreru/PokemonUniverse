package es.pokemonuniverse.domain.game.engines.pokedexentryguess;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessingRound;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.TimedRoundStrategy;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessAction;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessAttempt;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessAttemptOutcome;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessLastAttempt;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPlayerState;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPokemonSummary;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPublicEntry;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPublicPokemon;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPublicState;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessRevealedPokemon;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessRoundPublicResult;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessRoundResult;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessRoundTarget;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessSolve;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessSolvedPlayer;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessState;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.PokedexEntryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code pokedex-entry-guess/server.ts}. */
public final class PokedexEntryGuessEngine implements
    GameEngine<PokedexEntryGuessConfig, PokedexEntryGuessState, PokedexEntryGuessAction, PokedexEntryGuessPublicState> {

  public static final String ID = "pokedex-entry-guess";
  public static final long POKEDEX_ENTRY_GUESS_COOLDOWN_MS = 1_000;
  public static final long POKEDEX_ENTRY_GUESS_REVEAL_MS = 4_000;

  private static final TimedRoundStrategy<PokedexEntryGuessState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public PokedexEntryGuessState beginNext(PokedexEntryGuessState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public PokedexEntryGuessState resolveActive(PokedexEntryGuessState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public PokedexEntryGuessState finish(PokedexEntryGuessState state, GameContext context) {
      return state.finished();
    }

    @Override
    public boolean isComplete(PokedexEntryGuessState state) {
      return state.roundNumber() >= state.config().rounds();
    }
  };

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public PokedexEntryGuessEngine(GameManifest manifest) {
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
  public PokedexEntryGuessConfig parseConfig(JsonNode raw) {
    return PokedexEntryGuessConfig.parse(raw);
  }

  @Override
  public PokedexEntryGuessAction parseAction(JsonNode raw) {
    return PokedexEntryGuessAction.parse(raw);
  }

  @Override
  public PokedexEntryGuessConfig defaultConfig() {
    return PokedexEntryGuessConfig.defaults();
  }

  /** {@code isPokedexEntryPokemonCatalog(context.pokemon)} de TS es {@code instanceof PokedexEntryPokemonCatalog}. */
  private static PokedexEntryPokemonCatalog requireEntries(GameContext context) {
    if (!(context.pokemon() instanceof PokedexEntryPokemonCatalog catalog)) {
      throw new EngineException(
          "El catálogo Pokémon no contiene entradas Pokédex en español. Ejecuta el seed actualizado.");
    }
    return catalog;
  }

  record Candidate(Pokemon pokemon, List<PokedexEntry> entries) {}

  /** Pokémon por defecto con alguna entrada en español; la comprobación no consume {@code random}. */
  static List<Candidate> candidatePool(PokedexEntryGuessConfig config, GameContext context) {
    var catalog = requireEntries(context);
    int reference = PokedexEntryGuessRules.pokedexEntryReferenceGeneration(config.generations());
    var candidates = new ArrayList<Candidate>();
    for (var pokemon : catalog.forGenerations(config.generations())) {
      if (!pokemon.isDefault()) continue;
      var entries = catalog.pokedexEntries(pokemon.id());
      if (PokedexEntryGuessRules.resolvePokedexEntry(entries, reference, () -> 0) != null) {
        candidates.add(new Candidate(pokemon, entries));
      }
    }
    return candidates;
  }

  /**
   * Barajados completos del pool hasta llenar las rondas: cada pasada consume {@code random} {@code n - 1} veces y
   * después una vez por candidato recorrido (la entrada elegida); {@code preloadImage} solo si el contexto lo trae.
   */
  static List<PokedexEntryGuessRoundTarget> prepareRoundDeck(PokedexEntryGuessConfig config, GameContext context) {
    var candidates = candidatePool(config, context);
    int minimum = Math.min(config.rounds(), 2);
    if (candidates.size() < minimum) {
      throw new EngineException(
          "No hay suficientes Pokémon con entradas Pokédex válidas en español para esta configuración.");
    }
    int reference = PokedexEntryGuessRules.pokedexEntryReferenceGeneration(config.generations());
    var deck = new ArrayList<PokedexEntryGuessRoundTarget>();
    var usedEntries = new HashSet<String>();
    while (deck.size() < config.rounds()) {
      for (var candidate : Randoms.shuffled(candidates, context.random())) {
        var entry = PokedexEntryGuessRules.resolvePokedexEntry(candidate.entries(), reference, context.random(),
            usedEntries);
        if (entry == null) continue;
        deck.add(new PokedexEntryGuessRoundTarget(candidate.pokemon().id(), entry));
        usedEntries.add(PokedexEntryGuessRules.pokedexEntryKey(entry));
        if (deck.size() >= config.rounds()) break;
      }
    }
    if (context.preloadImage() != null) {
      for (var target : deck) {
        context.pokemon().byId(target.pokemonId()).ifPresent(pokemon -> context.preloadImage().accept(pokemon.sprite()));
      }
    }
    return deck;
  }

  private static @Nullable PokedexEntryGuessRoundTarget activeTarget(PokedexEntryGuessState state) {
    int index = state.roundNumber() - 1;
    return index >= 0 && index < state.roundDeck().size() ? state.roundDeck().get(index) : null;
  }

  private static PokedexEntryGuessState beginRound(PokedexEntryGuessState state, GameContext context) {
    int nextRound = state.roundNumber() + 1;
    var target = nextRound - 1 < state.roundDeck().size() ? state.roundDeck().get(nextRound - 1) : null;
    if (target == null || context.pokemon().byId(target.pokemonId()).isEmpty()) {
      throw new EngineException("No se pudo preparar la siguiente entrada Pokédex.");
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(nextRound)
        .attempts(List.of())
        .attemptCounts(Map.of())
        .solves(Map.of())
        .cooldownUntil(Map.of())
        .lastAttemptResult(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static PokedexEntryGuessState resolveRound(PokedexEntryGuessState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var target = activeTarget(state);
    var pokemon = target == null ? null : context.pokemon().byId(target.pokemonId()).orElse(null);
    if (target == null || pokemon == null) throw new EngineException("La respuesta de la ronda ya no está disponible.");
    var playerStats = new LinkedHashMap<>(state.playerStats());
    for (var playerId : state.playerIds()) {
      if (!state.solves().containsKey(playerId)) {
        playerStats.put(playerId, playerStats.getOrDefault(playerId, PokedexEntryGuessPlayerStats.ZERO).afterMiss());
      }
    }
    var lastRound = new PokedexEntryGuessRoundResult(PokedexEntryGuessRevealedPokemon.of(pokemon), target.entry(),
        new LinkedHashMap<>(state.solves()), new LinkedHashMap<>(state.attemptCounts()));
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + POKEDEX_ENTRY_GUESS_REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static PokedexEntryGuessState resolveIfComplete(PokedexEntryGuessState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), PokedexEntryGuessEngine::resolveRound);
  }

  /** Visible en los resultados de ronda y de partida: la entrada completa, sin enmascarar. */
  private static @Nullable PokedexEntryGuessRoundPublicResult publicRoundResult(PokedexEntryGuessState state) {
    var lastRound = state.lastRound();
    if (lastRound == null
        || (state.phase() != GamePhase.ROUND_RESULTS && state.phase() != GamePhase.GAME_RESULTS)) {
      return null;
    }
    var pokemon = lastRound.pokemon();
    var entry = lastRound.entry();
    return new PokedexEntryGuessRoundPublicResult(
        new PokedexEntryGuessPublicPokemon(pokemon.name(), pokemon.sprite(), pokemon.generation()),
        new PokedexEntryGuessPublicEntry(entry.text(), entry.generation(), entry.versionLabel()),
        lastRound.solves(), lastRound.attemptCounts());
  }

  @Override
  public PokedexEntryGuessState createInitialState(PokedexEntryGuessConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, PokedexEntryGuessPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, PokedexEntryGuessPlayerStats.ZERO);
    }
    return PokedexEntryGuessState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .referenceGeneration(PokedexEntryGuessRules.pokedexEntryReferenceGeneration(config.generations()))
        .playerIds(playerIds)
        .roundDeck(prepareRoundDeck(config, context))
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public PokedexEntryGuessState start(PokedexEntryGuessState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  @Override
  public GameActionResult<PokedexEntryGuessState> handleAction(PokedexEntryGuessState state, String playerId,
      PokedexEntryGuessAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
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
      return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
    }
    var target = activeTarget(state);
    if (target == null) return GameActionResult.reject(state, "La respuesta no está disponible.");
    int attemptCount = state.attemptCounts().getOrDefault(playerId, 0) + 1;
    var stats = state.playerStats().getOrDefault(playerId, PokedexEntryGuessPlayerStats.ZERO);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, attemptCount);
    var lastAttemptResult = new LinkedHashMap<>(state.lastAttemptResult());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    if (guessed.id().equals(target.pokemonId())) {
      int solveOrder = state.solves().size() + 1;
      int points = PokedexEntryGuessRules.pokedexEntryRoundPoints(state.playerIds().size(), solveOrder);
      long elapsedMs = context.now() - Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId, new PokedexEntryGuessSolve(solveOrder, context.now(), elapsedMs, points, attemptCount));
      lastAttemptResult.put(playerId,
          new PokedexEntryGuessLastAttempt(PokedexEntryGuessAttemptOutcome.CORRECT, context.now()));
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + points);
      playerStats.put(playerId, GuessingRound.recordGuessSolve(stats, attemptCount, solveOrder, elapsedMs, points));
      var next = state.toBuilder()
          .attemptCounts(attemptCounts)
          .solves(solves)
          .lastAttemptResult(lastAttemptResult)
          .scores(scores)
          .playerStats(playerStats)
          .build();
      return GameActionResult.accept(resolveIfComplete(next, context));
    }
    var attempts = new ArrayList<>(state.attempts());
    attempts.add(new PokedexEntryGuessAttempt(playerId, PokedexEntryGuessPokemonSummary.of(guessed), context.now()));
    lastAttemptResult.put(playerId,
        new PokedexEntryGuessLastAttempt(PokedexEntryGuessAttemptOutcome.INCORRECT, context.now()));
    playerStats.put(playerId, stats.afterWrongAttempt());
    return GameActionResult.accept(state.toBuilder()
        .attempts(attempts)
        .attemptCounts(attemptCounts)
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(),
            POKEDEX_ENTRY_GUESS_COOLDOWN_MS))
        .lastAttemptResult(lastAttemptResult)
        .playerStats(playerStats)
        .build());
  }

  @Override
  public PokedexEntryGuessState handleTimeout(PokedexEntryGuessState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public PokedexEntryGuessState handlePresenceChange(PokedexEntryGuessState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public PokedexEntryGuessPublicState getPublicState(PokedexEntryGuessState state, GameContext context) {
    var target = activeTarget(state);
    var pokemon = target == null ? null : context.pokemon().byId(target.pokemonId()).orElse(null);
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE;
    var solvedPlayers = state.solves().entrySet().stream()
        .map(entry -> new PokedexEntryGuessSolvedPlayer(entry.getKey(), entry.getValue().solveOrder()))
        .sorted(Comparator.comparingInt(PokedexEntryGuessSolvedPlayer::solveOrder))
        .toList();
    return new PokedexEntryGuessPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        state.referenceGeneration(),
        active && target != null && pokemon != null
            ? PokedexEntryGuessRules.sanitizePokedexEntry(target.entry().text(), pokemon)
            : null,
        active && pokemon != null ? PokedexEntryGuessRules.buildPokedexEntryHints(pokemon, state.config()) : List.of(),
        state.attempts(), solvedPlayers, state.scores(), state.roundStartedAt(), state.roundEndsAt(),
        state.nextTransitionAt(), publicRoundResult(state),
        state.phase() == GamePhase.GAME_RESULTS ? PokedexEntryGuessRules.buildPokedexEntryResults(state) : null);
  }

  @Override
  public PokedexEntryGuessPlayerState getPlayerState(PokedexEntryGuessState state, String playerId,
      GameContext context) {
    var solve = state.solves().get(playerId);
    return new PokedexEntryGuessPlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && context.isPlayerRequired(playerId) && solve == null,
        solve != null,
        solve == null ? null : solve.solveOrder(),
        state.cooldownUntil().get(playerId),
        solve == null ? 0 : solve.points(),
        state.attemptCounts().getOrDefault(playerId, 0),
        state.lastAttemptResult().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(PokedexEntryGuessState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(PokedexEntryGuessState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(PokedexEntryGuessState state) {
    return PokedexEntryGuessRules.buildPokedexEntryResults(state);
  }
}
