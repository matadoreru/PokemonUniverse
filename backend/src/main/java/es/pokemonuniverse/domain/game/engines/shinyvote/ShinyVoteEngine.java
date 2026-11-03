package es.pokemonuniverse.domain.game.engines.shinyvote;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.AssetTokens;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig.CandidateMode;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig.VoteVisibility;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyGeneratedOptions;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyOption;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyOptionId;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyOptionState;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyPlayerRoundResult;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyPlayerStats;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyRoundResult;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVote;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVoteAction;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVotePlayerState;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVotePublicState;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVoteState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.DoubleSupplier;

/** Traducción literal de {@code shiny-vote/server.ts}. */
public final class ShinyVoteEngine
    implements GameEngine<ShinyVoteConfig, ShinyVoteState, ShinyVoteAction, ShinyVotePublicState> {

  public static final String ID = "shiny-vote";
  /** {@code REVEAL_DURATION_MS}. */
  public static final long REVEAL_MS = 3_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public ShinyVoteEngine(GameManifest manifest) {
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
  public ShinyVoteConfig parseConfig(JsonNode raw) {
    return ShinyVoteConfig.parse(raw);
  }

  @Override
  public ShinyVoteAction parseAction(JsonNode raw) {
    return ShinyVoteAction.parse(raw);
  }

  @Override
  public ShinyVoteConfig defaultConfig() {
    return ShinyVoteConfig.defaults();
  }

  /** {@code takeRandom}: extrae sin reemplazo con {@code splice}; un {@code random()} por elemento elegido. */
  static <T> List<T> takeRandom(List<T> source, int count, DoubleSupplier random) {
    var pool = new ArrayList<>(source);
    var selected = new ArrayList<T>();
    while (selected.size() < count && !pool.isEmpty()) {
      int index = Math.min((int) Math.floor(random.getAsDouble() * pool.size()), pool.size() - 1);
      selected.add(pool.remove(index));
    }
    return selected;
  }

  /** {@code shinySprite}: {@code pokemon.shinySprite ?? pokemon.sprite}. */
  private static String shinySprite(Pokemon pokemon) {
    return pokemon.shinySprite() != null ? pokemon.shinySprite() : pokemon.sprite();
  }

  /** {@code shinyPool}: solo los Pokémon con sprite shiny oficial ({@code Boolean(pokemon.shinySprite)}). */
  private static List<Pokemon> shinyPool(ShinyVoteConfig config, GameContext context) {
    return context.pokemon().forGenerations(config.generations()).stream()
        .filter(pokemon -> pokemon.shinySprite() != null && !pokemon.shinySprite().isEmpty())
        .toList();
  }

  private static String requiredPokemonMessage(int requiredPokemon) {
    return "At least " + requiredPokemon + " Pokémon are required for the selected generations";
  }

  /**
   * {@code createOptions}: {@code requiredPokemon} extracciones de {@code takeRandom}, una para el índice correcto, cinco
   * para barajar las paletas y una por señuelo ({@code useShinySpriteForFake}); el shiny oficial no consume
   * ({@code authentic || ...}).
   */
  private static ShinyGeneratedOptions createOptions(ShinyVoteState state, GameContext context) {
    boolean samePokemon = state.config().candidateMode() == CandidateMode.SAME_POKEMON;
    var optionIds = List.of(ShinyOptionId.values()).subList(0, state.config().optionCount());
    int requiredPokemon = samePokemon ? 1 : optionIds.size();
    var selected = takeRandom(shinyPool(state.config(), context), requiredPokemon, context.random());
    if (selected.size() < requiredPokemon) throw new EngineException(requiredPokemonMessage(requiredPokemon));
    List<Pokemon> candidates = samePokemon ? optionIds.stream().map(id -> selected.getFirst()).toList() : selected;
    int correctIndex = Math.min((int) Math.floor(context.random().getAsDouble() * optionIds.size()),
        optionIds.size() - 1);
    var palettes = Randoms.shuffled(ShinyVoteFilters.FAKE_SHINY_PALETTES, context.random());
    int fakePaletteIndex = 0;
    var options = new ArrayList<ShinyOptionState>();
    for (int index = 0; index < candidates.size(); index++) {
      var pokemon = candidates.get(index);
      boolean authentic = index == correctIndex;
      boolean useShinyBase = authentic || ShinyVoteFilters.useShinySpriteForFake(context.random());
      options.add(new ShinyOptionState(optionIds.get(index), pokemon.id(), pokemon.name(),
          useShinyBase ? shinySprite(pokemon) : pokemon.sprite(),
          authentic ? null : ShinyVoteFilters.fakeShinyPalette(palettes, fakePaletteIndex++)));
    }
    return new ShinyGeneratedOptions(options, optionIds.get(correctIndex));
  }

  /** {@code optionResolution}: el shiny oficial en {@code PIXEL_ART} y los señuelos en {@code PALETTE_RECOLOR}. */
  private static AssetResolution optionResolution(ShinyOptionState option) {
    return option.recolor() != null
        ? new AssetResolution(option.sprite(), AssetResolution.Transform.PALETTE_RECOLOR, null, null, option.recolor())
        : new AssetResolution(option.sprite(), AssetResolution.Transform.PIXEL_ART, null, null, null);
  }

  /** Precarga lo mismo que servirá {@code resolveAsset}: efecto lateral sin estado ni azar. */
  private static void preloadOptions(List<ShinyOptionState> options, GameContext context) {
    var preload = context.preloadAsset();
    if (preload == null) return;
    for (var option : options) preload.accept(optionResolution(option));
  }

  /** {@code prepareNextRound}: nulo tras la última ronda; precarga cada opción si el contexto lo trae. */
  private static @Nullable ShinyGeneratedOptions prepareNextRound(ShinyVoteState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) return null;
    var generated = createOptions(state, context);
    preloadOptions(generated.options(), context);
    return generated;
  }

  private static ShinyVoteState beginRound(ShinyVoteState state, GameContext context) {
    boolean prepared = state.preparedOptions() != null && state.preparedCorrectOptionId() != null;
    var generated = prepared
        ? new ShinyGeneratedOptions(state.preparedOptions(), state.preparedCorrectOptionId())
        : createOptions(state, context);
    // Sin opciones preparadas (la primera ronda) aún no se ha precargado nada.
    if (!prepared) preloadOptions(generated.options(), context);
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .options(generated.options())
        .correctOptionId(generated.correctOptionId())
        .votes(Map.of())
        .roundStartedAt(context.now())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .prepared(null)
        .build();
  }

  private static ShinyVoteState revealRound(ShinyVoteState state, GameContext context) {
    var correctOptionId = state.correctOptionId();
    if (state.phase() != GamePhase.ROUND_ACTIVE || correctOptionId == null) return state;
    var playerOrder = new HashMap<String, Integer>();
    for (int index = 0; index < state.playerIds().size(); index++) {
      playerOrder.put(state.playerIds().get(index), index);
    }
    var correctPlayerIds = state.playerIds().stream()
        .filter(playerId -> state.votes().containsKey(playerId)
            && state.votes().get(playerId).optionId() == correctOptionId)
        .sorted(Comparator.<String>comparingLong(playerId -> state.votes().get(playerId).votedAt())
            .thenComparingInt(playerOrder::get))
        .toList();
    var missedPlayerIds = state.playerIds().stream()
        .filter(playerId -> !state.votes().containsKey(playerId)
            || state.votes().get(playerId).optionId() != correctOptionId)
        .toList();
    var correctSet = new HashSet<>(correctPlayerIds);
    var scores = new LinkedHashMap<>(state.scores());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    var correctOrder = new HashMap<String, Integer>();
    for (int index = 0; index < correctPlayerIds.size(); index++) {
      correctOrder.put(correctPlayerIds.get(index), index + 1);
    }
    for (var playerId : state.playerIds()) {
      var previous = state.playerStats().getOrDefault(playerId, ShinyPlayerStats.ZERO);
      boolean voted = state.votes().containsKey(playerId);
      boolean correct = correctSet.contains(playerId);
      scores.put(playerId, scores.getOrDefault(playerId, 0)
          + (correct ? ShinyVoteRules.shinyPointsForOrder(correctOrder.get(playerId)) : 0));
      playerStats.put(playerId,
          new ShinyPlayerStats(previous.votes() + (voted ? 1 : 0), previous.correctVotes() + (correct ? 1 : 0)));
    }
    var lastRound = new ShinyRoundResult(state.roundNumber(), correctOptionId, new LinkedHashMap<>(state.votes()),
        correctPlayerIds, missedPlayerIds);
    return state.toBuilder()
        .prepared(prepareNextRound(state, context))
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  private static ShinyVoteState resolveIfComplete(ShinyVoteState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.votes().containsKey(id), ShinyVoteEngine::revealRound);
  }

  /** {@code assetToken} es solo {@code context.now.toString(36)}: no consume {@code random()}. */
  @Override
  public ShinyVoteState createInitialState(ShinyVoteConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("At least " + manifest.minPlayers() + " player is required");
    }
    int requiredPokemon = config.candidateMode() == CandidateMode.SAME_POKEMON ? 1 : config.optionCount();
    if (shinyPool(config, context).size() < requiredPokemon) {
      throw new EngineException(requiredPokemonMessage(requiredPokemon));
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, ShinyPlayerStats>();
    for (var id : playerIds) scores.put(id, 0);
    for (var id : playerIds) playerStats.put(id, ShinyPlayerStats.ZERO);
    return ShinyVoteState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .assetToken(Long.toString(context.now(), 36))
        .playerIds(playerIds)
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public ShinyVoteState start(ShinyVoteState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("Game already started");
    return beginRound(state, context);
  }

  /** El {@code 'Unknown action'} de TS es inalcanzable: {@link ShinyVoteAction#parse} solo admite {@code VOTE}. */
  @Override
  public GameActionResult<ShinyVoteState> handleAction(ShinyVoteState state, String playerId, ShinyVoteAction action,
      GameContext context) {
    if (!state.playerIds().contains(playerId)) return GameActionResult.reject(state, "No participas en esta partida.");
    if (!context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No estás conectado como participante.");
    }
    if (state.phase() != GamePhase.ROUND_ACTIVE) {
      return GameActionResult.reject(state, "La ronda no está en fase de votación.");
    }
    if (context.now() >= Objects.requireNonNullElse(state.roundEndsAt(), 0L)) {
      // Rechazo que también revela la ronda (y prepara la siguiente), como el { state: revealRound(...) } de TS.
      return GameActionResult.reject(revealRound(state, context), "La votación ha terminado.");
    }
    if (state.votes().containsKey(playerId)) return GameActionResult.reject(state, "Tu voto ya está bloqueado.");
    if (state.options().stream().noneMatch(option -> option.id() == action.optionId())) {
      return GameActionResult.reject(state, "La opción no pertenece a esta ronda.");
    }
    var votes = new LinkedHashMap<>(state.votes());
    votes.put(playerId, new ShinyVote(action.optionId(), context.now()));
    var next = state.toBuilder().votes(votes).build();
    return GameActionResult.accept(resolveIfComplete(next, context));
  }

  /** {@code handleTimeout} propio (no usa {@code advanceTimedRound}); un plazo nulo es {@code Infinity}. */
  @Override
  public ShinyVoteState handleTimeout(ShinyVoteState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_RESULTS && state.nextTransitionAt() != null
        && context.now() >= state.nextTransitionAt()) {
      return state.roundNumber() >= state.config().rounds() ? state.finished() : beginRound(state, context);
    }
    if (state.phase() != GamePhase.ROUND_ACTIVE || state.roundEndsAt() == null
        || context.now() < state.roundEndsAt()) {
      return state;
    }
    return revealRound(state, context);
  }

  @Override
  public ShinyVoteState handlePresenceChange(ShinyVoteState state, GameContext context) {
    return resolveIfComplete(state, context);
  }

  @Override
  public ShinyVotePublicState getPublicState(ShinyVoteState state, GameContext context) {
    boolean reveal = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    var results = state.phase() == GamePhase.GAME_RESULTS ? ShinyVoteRules.buildShinyResults(state) : null;
    // context.roomCode es falsy (nulo o vacío): el sprite real, como el TS.
    var roomCode = context.roomCode();
    var options = state.options().stream()
        .map(option -> new ShinyOption(option.id(), option.pokemonId(), option.pokemonName(),
            roomCode != null && !roomCode.isEmpty()
                ? AssetTokens.roundAssetPath(roomCode, state.assetToken(), state.roundNumber(), option.id().name(),
                    "sprite")
                : option.sprite()))
        .toList();
    return new ShinyVotePublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        // REVEAL: durante la ronda solo se publica quién ha votado, nunca qué.
        state.playerIds(), options,
        state.config().voteVisibility() == VoteVisibility.LIVE || reveal ? state.votes() : Map.of(),
        List.copyOf(state.votes().keySet()), state.config().voteVisibility(),
        state.playerIds().stream().filter(playerId -> !state.votes().containsKey(playerId)).toList(),
        state.scores(), state.roundStartedAt(), state.roundEndsAt(), state.nextTransitionAt(),
        reveal ? state.correctOptionId() : null, reveal ? state.lastRound() : null, results == null ? null : results.winnerId(),
        results);
  }

  /** {@code canVote} no comprueba la conexión; {@code roundResult} solo en {@code ROUND_RESULTS}. */
  @Override
  public ShinyVotePlayerState getPlayerState(ShinyVoteState state, String playerId, GameContext context) {
    var lastRound = state.lastRound();
    int correctIndex = lastRound == null ? -1 : lastRound.correctPlayerIds().indexOf(playerId);
    return new ShinyVotePlayerState(
        state.phase() == GamePhase.ROUND_ACTIVE && state.playerIds().contains(playerId)
            && !state.votes().containsKey(playerId),
        state.votes().get(playerId),
        state.phase() == GamePhase.ROUND_RESULTS && lastRound != null
            ? new ShinyPlayerRoundResult(correctIndex >= 0,
                correctIndex >= 0 ? ShinyVoteRules.shinyPointsForOrder(correctIndex + 1) : 0)
            : null);
  }

  /** Cada opción de la ronda pedida: el shiny oficial en {@code PIXEL_ART} y los señuelos en {@code PALETTE_RECOLOR}. */
  @Override
  public Optional<AssetResolution> resolveAsset(ShinyVoteState state, AssetRequest request, GameContext context) {
    if (!state.assetToken().equals(request.assetToken()) || state.roundNumber() != request.roundNumber()) {
      return Optional.empty();
    }
    return state.options().stream()
        .filter(candidate -> candidate.id().name().equals(request.assetId()))
        .findFirst()
        .map(ShinyVoteEngine::optionResolution);
  }

  @Override
  public GameLifecycle getLifecycle(ShinyVoteState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(ShinyVoteState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(ShinyVoteState state) {
    return ShinyVoteRules.buildShinyResults(state);
  }
}
