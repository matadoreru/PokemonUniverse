package es.pokemonuniverse.domain.game.engines.unowntranslator;

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
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownAlphabetEntry;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownMessage;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorAction;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorAttemptOutcome;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorLastAttempt;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPlayerState;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPlayerStats;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPokemon;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPublicState;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorRoundResult;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorSolve;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorState;
import es.pokemonuniverse.domain.pokemon.LearnsetPokemonCatalog;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.IntStream;

/**
 * Traductor Unown: un nombre cifrado con glifos Unown y una clave barajada una vez por partida. Cada
 * {@code hintSeconds} una pista revela una letra oculta del mensaje, que se queda en el alfabeto de la partida; gana
 * más quien descifra con menos letras a la vista. Sigue a Zoomed Pokémon en el ciclo por tiempo, el bloqueo tras un
 * fallo y los aciertos en carrera.
 */
public final class UnownTranslatorEngine implements
    GameEngine<UnownTranslatorConfig, UnownTranslatorState, UnownTranslatorAction, UnownTranslatorPublicState> {

  public static final String ID = "unown-translator";

  private static final String NO_MOVES = "No hay movimientos disponibles en esas generaciones.";

  private final GameManifest manifest;

  /** {@code handleTimeout}: ciclo común con {@code tickActive}, que da las pistas que hayan vencido. */
  private static final TimedRoundStrategy<UnownTranslatorState> ROUND_STRATEGY = new TimedRoundStrategy<>() {
    @Override
    public UnownTranslatorState beginNext(UnownTranslatorState state, GameContext context) {
      return beginRound(state, context);
    }

    @Override
    public UnownTranslatorState resolveActive(UnownTranslatorState state, GameContext context) {
      return resolveRound(state, context);
    }

    @Override
    public UnownTranslatorState finish(UnownTranslatorState state, GameContext context) {
      return state.finished();
    }

    /** El total real es el mazo elegido: en {@code MOVES} puede ser menor que {@code rounds}. */
    @Override
    public boolean isComplete(UnownTranslatorState state) {
      return state.roundNumber() >= state.messages().size();
    }

    /**
     * Revela todas las pistas vencidas (un tick tardío puede traer varias), cada una con un {@code random()} entre las
     * letras distintas que siguen ocultas, en orden alfabético. Sin pistas vencidas devuelve el mismo estado.
     */
    @Override
    public UnownTranslatorState tickActive(UnownTranslatorState current, GameContext context) {
      var message = currentMessage(current);
      var alphabet = new ArrayList<>(current.alphabet());
      int hintsGiven = current.hintsGiven();
      while (true) {
        var due = hintTime(current, hintsGiven + 1);
        if (due == null || due > context.now()) break;
        var hidden = UnownTranslatorRules.hiddenDistinctLetters(message.normalized(), alphabet);
        if (hidden.isEmpty()) break;
        alphabet.add(Randoms.randomItem(hidden, context.random()));
        hintsGiven++;
      }
      if (hintsGiven == current.hintsGiven()) return current;
      var next = current.toBuilder().alphabet(alphabet).hintsGiven(hintsGiven).build();
      return next.toBuilder().nextTransitionAt(nextHintAt(next)).build();
    }
  };

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public UnownTranslatorEngine(GameManifest manifest) {
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
  public UnownTranslatorConfig parseConfig(JsonNode raw) {
    return UnownTranslatorConfig.parse(raw);
  }

  @Override
  public UnownTranslatorAction parseAction(JsonNode raw) {
    return UnownTranslatorAction.parse(raw);
  }

  @Override
  public UnownTranslatorConfig defaultConfig() {
    return UnownTranslatorConfig.defaults();
  }

  /** Nunca recorre los movimientos: en {@code MOVES} basta con un catálogo con aprendizajes y algún Pokémon. */
  @Override
  public Optional<String> checkAvailability(UnownTranslatorConfig config, GameContext context) {
    return UnownTranslatorRules.availabilityIssue(config, context.pokemon());
  }

  private static UnownMessage currentMessage(UnownTranslatorState state) {
    return state.messages().get(state.roundNumber() - 1);
  }

  /** Hora de la pista {@code k} (desde 1), o nula si caería en {@code roundEndsAt} o después. */
  private static @Nullable Long hintTime(UnownTranslatorState state, int k) {
    long roundStartedAt = Objects.requireNonNull(state.roundStartedAt(), "roundStartedAt");
    long roundEndsAt = Objects.requireNonNull(state.roundEndsAt(), "roundEndsAt");
    long at = roundStartedAt + (long) k * state.config().hintSeconds() * 1_000L;
    return at >= roundEndsAt ? null : at;
  }

  /** La siguiente pista, o nula si ya no quedan letras ocultas o si caería en {@code roundEndsAt} o después. */
  private static @Nullable Long nextHintAt(UnownTranslatorState state) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return null;
    if (UnownTranslatorRules.hiddenDistinctLetters(currentMessage(state).normalized(), state.alphabet()).isEmpty()) {
      return null;
    }
    return hintTime(state, state.hintsGiven() + 1);
  }

  /**
   * Mazo barajado: en {@code CLASSIC} hay al menos {@code rounds} (lo exige la disponibilidad); en {@code MOVES},
   * quizá menos.
   */
  private static List<UnownMessage> chooseMessages(UnownTranslatorConfig config, GameContext context) {
    List<UnownMessage> deck;
    if (config.mode() == UnownTranslatorMode.MOVES) {
      if (!(context.pokemon() instanceof LearnsetPokemonCatalog catalog)) throw new EngineException(NO_MOVES);
      deck = UnownTranslatorRules.moveDeck(config, catalog);
      if (deck.isEmpty()) throw new EngineException(NO_MOVES);
    } else {
      deck = UnownTranslatorRules.pokemonDeck(config, context.pokemon());
    }
    var shuffled = Randoms.shuffled(deck, context.random());
    return List.copyOf(shuffled.subList(0, Math.min(config.rounds(), shuffled.size())));
  }

  /**
   * Ronda nueva con el alfabeto de la partida intacto: las letras de rondas anteriores salen ya traducidas. La primera
   * pista es nula si el mensaje ya se ve entero.
   */
  private static UnownTranslatorState beginRound(UnownTranslatorState state, GameContext context) {
    long roundStartedAt = context.now();
    var next = state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .hintsGiven(0)
        .solves(Map.of())
        .attemptCounts(Map.of())
        .lastAttemptResult(Map.of())
        .cooldownUntil(Map.of())
        .roundStartedAt(roundStartedAt)
        .roundEndsAt(roundStartedAt + state.config().roundSeconds() * 1_000L)
        .lastRound(null)
        .build();
    return next.toBuilder().nextTransitionAt(nextHintAt(next)).build();
  }

  /** Cierra la ronda: quien no acertó suma un fallo. Las letras que seguían ocultas no pasan al alfabeto. */
  private static UnownTranslatorState resolveRound(UnownTranslatorState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var message = currentMessage(state);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    var missing = new ArrayList<String>();
    for (var playerId : state.playerIds()) {
      if (!state.solves().containsKey(playerId)) {
        missing.add(playerId);
        playerStats.put(playerId, playerStats.getOrDefault(playerId, UnownTranslatorPlayerStats.ZERO).afterMiss());
      }
    }
    UnownTranslatorPokemon pokemon = null;
    if (message.pokemonId() != null) {
      pokemon = context.pokemon().byId(message.pokemonId())
          .map(found -> new UnownTranslatorPokemon(found.id(), found.name(), found.sprite(),
              found.nationalDexNumber(), found.types()))
          .orElseThrow(() -> new EngineException("El Pokémon del mensaje ya no está disponible."));
    }
    var lastRound = new UnownTranslatorRoundResult(state.config().mode(), message.text(), pokemon, message.move(),
        List.copyOf(state.solves().values()), missing);
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + UnownTranslatorRules.REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static UnownTranslatorState resolveIfComplete(UnownTranslatorState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.solves().containsKey(id), UnownTranslatorEngine::resolveRound);
  }

  /** No consume {@code random}: la clave y los mensajes se eligen en {@link #start}. */
  @Override
  public UnownTranslatorState createInitialState(UnownTranslatorConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    var issue = checkAvailability(config, context);
    if (issue.isPresent()) throw new EngineException(issue.get());
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, UnownTranslatorPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, UnownTranslatorPlayerStats.ZERO);
    }
    return UnownTranslatorState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  /** Orden del azar: primero la clave (25 extracciones al barajar 0..25) y después el mazo. */
  @Override
  public UnownTranslatorState start(UnownTranslatorState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    var key = Randoms.shuffled(IntStream.range(0, UnownTranslatorRules.GLYPH_COUNT).boxed().toList(),
        context.random());
    var messages = chooseMessages(state.config(), context);
    return beginRound(state.toBuilder().key(key).messages(messages).build(), context);
  }

  /** Un fallo no es un rechazo: se acepta, suma el intento y bloquea {@code COOLDOWN_MS}. */
  @Override
  public GameActionResult<UnownTranslatorState> handleAction(UnownTranslatorState state, String playerId,
      UnownTranslatorAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
    }
    if (state.solves().containsKey(playerId)) return GameActionResult.reject(state, "Ya lo has descifrado.");
    if (context.now() >= Objects.requireNonNullElse(state.roundEndsAt(), 0L)) {
      // Rechazo que también resuelve la ronda, como en Zoomed Pokémon.
      return GameActionResult.reject(resolveRound(state, context), "El tiempo ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    var guess = ((UnownTranslatorAction.Guess) action).text();
    var message = currentMessage(state);
    var attemptCounts = new LinkedHashMap<>(state.attemptCounts());
    attemptCounts.put(playerId, state.attemptCounts().getOrDefault(playerId, 0) + 1);
    var lastAttemptResult = new LinkedHashMap<>(state.lastAttemptResult());
    if (UnownTranslatorRules.matches(guess, message.normalized())) {
      int hidden = UnownTranslatorRules.hiddenLetters(message.normalized(), state.alphabet());
      int points = UnownTranslatorRules.solvePoints(hidden);
      boolean first = state.solves().isEmpty();
      var solves = new LinkedHashMap<>(state.solves());
      solves.put(playerId, new UnownTranslatorSolve(playerId, points, hidden, context.now()));
      lastAttemptResult.put(playerId, new UnownTranslatorLastAttempt(UnownTranslatorAttemptOutcome.CORRECT,
          context.now()));
      var scores = new LinkedHashMap<>(state.scores());
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + points);
      var playerStats = new LinkedHashMap<>(state.playerStats());
      playerStats.put(playerId, state.playerStats().getOrDefault(playerId, UnownTranslatorPlayerStats.ZERO)
          .afterSolve(first, hidden, points));
      var next = state.toBuilder()
          .solves(solves)
          .attemptCounts(attemptCounts)
          .lastAttemptResult(lastAttemptResult)
          .scores(scores)
          .playerStats(playerStats)
          .build();
      return GameActionResult.accept(resolveIfComplete(next, context));
    }
    // El texto fallido no se guarda en ningún sitio: solo cuenta el intento.
    lastAttemptResult.put(playerId, new UnownTranslatorLastAttempt(UnownTranslatorAttemptOutcome.INCORRECT,
        context.now()));
    return GameActionResult.accept(state.toBuilder()
        .attemptCounts(attemptCounts)
        .lastAttemptResult(lastAttemptResult)
        .cooldownUntil(Timing.setPlayerCooldown(state.cooldownUntil(), playerId, context.now(),
            UnownTranslatorRules.COOLDOWN_MS))
        .build());
  }

  @Override
  public UnownTranslatorState handleTimeout(UnownTranslatorState state, GameContext context) {
    return Timing.advanceTimedRound(state, context, ROUND_STRATEGY);
  }

  @Override
  public UnownTranslatorState handlePresenceChange(UnownTranslatorState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  /**
   * Las piezas solo salen en {@code ROUND_ACTIVE}; el alfabeto lleva solo las letras reveladas como pista, con su
   * glifo. {@code lastRound} sale en los resultados de ronda y en los finales.
   */
  @Override
  public UnownTranslatorPublicState getPublicState(UnownTranslatorState state, GameContext context) {
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE;
    var alphabet = state.alphabet().stream()
        .map(letter -> new UnownAlphabetEntry(state.key().get(letter.charAt(0) - 'A'), letter))
        .toList();
    var roundPoints = new LinkedHashMap<String, Integer>();
    state.solves().forEach((id, solve) -> roundPoints.put(id, solve.points()));
    boolean revealed = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    return UnownTranslatorPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .mode(state.config().mode())
        .roundNumber(state.roundNumber())
        .totalRounds(state.messages().isEmpty() ? state.config().rounds() : state.messages().size())
        .playerIds(state.playerIds())
        .tokens(active ? UnownTranslatorRules.tokens(currentMessage(state).normalized(), state.key(), state.alphabet())
            : List.of())
        .alphabet(alphabet)
        .solvedPlayerIds(List.copyOf(state.solves().keySet()))
        .roundPointsByPlayer(roundPoints)
        .scores(state.scores())
        .roundEndsAt(state.roundEndsAt())
        .nextHintAt(active ? state.nextTransitionAt() : null)
        .nextTransitionAt(state.nextTransitionAt())
        .lastRound(revealed ? state.lastRound() : null)
        .results(state.phase() == GamePhase.GAME_RESULTS ? UnownTranslatorRules.buildResults(state) : null)
        .build();
  }

  /** La respuesta solo va a quien ya la acertó. */
  @Override
  public UnownTranslatorPlayerState getPlayerState(UnownTranslatorState state, String playerId,
      GameContext context) {
    if (!state.playerIds().contains(playerId)) return UnownTranslatorPlayerState.spectator();
    var solve = state.solves().get(playerId);
    boolean active = state.phase() == GamePhase.ROUND_ACTIVE;
    return UnownTranslatorPlayerState.player(
        active && context.isPlayerRequired(playerId) && solve == null,
        solve != null,
        solve != null ? currentMessage(state).text() : null,
        state.cooldownUntil().get(playerId),
        state.attemptCounts().getOrDefault(playerId, 0),
        state.lastAttemptResult().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(UnownTranslatorState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(UnownTranslatorState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(UnownTranslatorState state) {
    return UnownTranslatorRules.buildResults(state);
  }
}
