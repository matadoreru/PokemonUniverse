package es.pokemonuniverse.domain.game.engines.secretranking;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.PromptDeck;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingRules.RankingDistance;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingAction;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingConsensus;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingPlayerState;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingPlayerStats;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingPokemon;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingPublicState;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingRoundPlayerResult;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingRoundResult;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code secret-ranking/server.ts}. */
public final class SecretRankingEngine
    implements GameEngine<SecretRankingConfig, SecretRankingState, SecretRankingAction, SecretRankingPublicState> {

  public static final String ID = "secret-ranking";
  public static final long REVEAL_MS = 8_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public SecretRankingEngine(GameManifest manifest) {
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
  public SecretRankingConfig parseConfig(JsonNode raw) {
    return SecretRankingConfig.parse(raw);
  }

  @Override
  public SecretRankingAction parseAction(JsonNode raw) {
    return SecretRankingAction.parse(raw);
  }

  @Override
  public SecretRankingConfig defaultConfig() {
    return SecretRankingConfig.defaults();
  }

  private static SecretRankingPokemon summary(Pokemon pokemon) {
    return new SecretRankingPokemon(pokemon.id(), pokemon.name(), pokemon.sprite());
  }

  /** Los ids que no están en el catálogo se omiten. */
  private static List<SecretRankingPokemon> pokemonForIds(List<String> ids, GameContext context) {
    var pokemon = new ArrayList<SecretRankingPokemon>();
    for (var id : ids) context.pokemon().byId(id).ifPresent(found -> pokemon.add(summary(found)));
    return pokemon;
  }

  /** Oficiales y del host, estas con el id prefijado. */
  private static List<SubjectiveCategory> promptPool(SecretRankingConfig config, GameContext context) {
    var pool = new ArrayList<SubjectiveCategory>();
    if (config.promptSource() != PromptSource.CUSTOM) pool.addAll(SecretRankingPrompts.OFFICIAL);
    if (config.promptSource() != PromptSource.OFFICIAL) {
      for (var prompt : context.hostCustomCategories()) {
        pool.add(new SubjectiveCategory("secret-ranking-custom-" + prompt.id(), prompt.text()));
      }
    }
    return pool;
  }

  private record ChosenPokemon(List<String> pokemonIds, List<String> usedPokemonIds) {}

  private static PromptDeck.Choice choosePrompt(SecretRankingState state, GameContext context) {
    return PromptDeck.choose(state.promptPool(), state.usedPromptIds(), SubjectiveCategory::id, context.random());
  }

  /**
   * Baraja los no usados y toma cinco; si no llegan, baraja el resto del pool (sin los ya elegidos) para completar y
   * empieza un ciclo nuevo con esos. Consume una o dos barajas de {@code random}.
   */
  private static ChosenPokemon choosePokemon(SecretRankingState state, GameContext context) {
    var unused = Randoms.shuffled(
        state.pokemonPoolIds().stream().filter(id -> !state.usedPokemonIds().contains(id)).toList(), context.random());
    var selected = unused.subList(0, Math.min(5, unused.size()));
    if (selected.size() == 5) {
      var usedPokemonIds = new ArrayList<>(state.usedPokemonIds());
      usedPokemonIds.addAll(selected);
      return new ChosenPokemon(List.copyOf(selected),
          usedPokemonIds.size() >= state.pokemonPoolIds().size() ? List.of() : usedPokemonIds);
    }
    var nextCycle = Randoms.shuffled(
        state.pokemonPoolIds().stream().filter(id -> !selected.contains(id)).toList(), context.random());
    var completion = nextCycle.subList(0, Math.min(5 - selected.size(), nextCycle.size()));
    var pokemonIds = new ArrayList<>(selected);
    pokemonIds.addAll(completion);
    return new ChosenPokemon(pokemonIds, List.copyOf(completion));
  }

  private static String promptText(SecretRankingState state) {
    return state.promptPool().stream()
        .filter(prompt -> prompt.id().equals(state.currentPromptId()))
        .findFirst()
        .map(SubjectiveCategory::text)
        .orElse("");
  }

  /** La pregunta se elige antes que los Pokémon. */
  private static SecretRankingState beginRound(SecretRankingState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    var prompt = choosePrompt(state, context);
    var pokemon = choosePokemon(state, context);
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .currentPromptId(prompt.promptId())
        .currentPokemonIds(pokemon.pokemonIds())
        .usedPromptIds(prompt.usedPromptIds())
        .usedPokemonIds(pokemon.usedPokemonIds())
        .submissions(Map.of())
        .roundEndsAt(context.now() + state.config().roundSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static SecretRankingState finishRound(SecretRankingState state, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    var submitted = new LinkedHashMap<String, List<String>>();
    for (var playerId : state.playerIds()) {
      var ranking = state.submissions().get(playerId);
      if (ranking != null) submitted.put(playerId, ranking);
    }
    var byPlayer = new HashMap<String, RankingDistance>();
    for (var distance : SecretRankingRules.secretRankingDistances(submitted)) {
      byPlayer.put(distance.playerId(), distance);
    }
    var pokemon = pokemonForIds(state.currentPokemonIds(), context);
    var pokemonById = new HashMap<String, SecretRankingPokemon>();
    for (var entry : pokemon) pokemonById.put(entry.id(), entry);
    var submittedRankings = new ArrayList<>(submitted.values());
    List<SecretRankingConsensus> consensus = List.of();
    if (!submittedRankings.isEmpty()) {
      var entries = new ArrayList<SecretRankingConsensus>();
      for (var pokemonId : state.currentPokemonIds()) {
        int total = 0;
        for (var ranking : submittedRankings) total += ranking.indexOf(pokemonId) + 1;
        entries.add(new SecretRankingConsensus(pokemonById.get(pokemonId), (double) total / submittedRankings.size()));
      }
      Comparator<SecretRankingConsensus> compare = (left, right) -> {
        int result = Double.compare(left.averagePosition(), right.averagePosition());
        return result != 0 ? result : Integer.compare(state.currentPokemonIds().indexOf(left.pokemon().id()),
            state.currentPokemonIds().indexOf(right.pokemon().id()));
      };
      entries.sort(compare);
      consensus = entries;
    }
    var scores = new LinkedHashMap<>(state.scores());
    var playerStats = new LinkedHashMap<String, SecretRankingPlayerStats>();
    for (var playerId : state.playerIds()) {
      var result = byPlayer.get(playerId);
      if (result != null) scores.put(playerId, scores.getOrDefault(playerId, 0) + result.points());
      playerStats.put(playerId, SecretRankingRules.statsOf(state, playerId)
          .afterRound(state.submissions().containsKey(playerId), result));
    }
    var players = new LinkedHashMap<String, SecretRankingRoundPlayerResult>();
    for (var playerId : state.playerIds()) {
      var ranking = state.submissions().get(playerId);
      var result = byPlayer.get(playerId);
      players.put(playerId, new SecretRankingRoundPlayerResult(
          ranking == null ? null : ranking.stream().map(pokemonById::get).filter(Objects::nonNull).toList(),
          result == null ? null : result.distance(),
          result == null ? null : result.position(),
          result == null ? 0 : result.points()));
    }
    var lastRound = new SecretRankingRoundResult(promptText(state), pokemon, consensus, players);
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + REVEAL_MS)
        .lastRound(lastRound)
        .build();
  }

  @Override
  public SecretRankingState createInitialState(SecretRankingConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Secret Ranking necesita al menos 3 jugadores; se recomiendan 4 o más.");
    }
    var pool = context.pokemon().forGenerations(config.generations(), config.includeForms()).stream()
        .filter(pokemon -> JsStrings.truthy(pokemon.sprite()) && (config.includeForms() || pokemon.isDefault()))
        .toList();
    if (pool.size() < 5) {
      throw new EngineException("Se necesitan al menos 5 Pokémon con imagen para esta configuración.");
    }
    var prompts = promptPool(config, context);
    if (prompts.isEmpty()) throw new EngineException("No hay preguntas activas para Secret Ranking.");
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, SecretRankingPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, SecretRankingPlayerStats.ZERO);
    }
    return SecretRankingState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .pokemonPoolIds(pool.stream().map(Pokemon::id).toList())
        .promptPool(prompts)
        .roundNumber(0)
        .currentPromptId(null)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public SecretRankingState start(SecretRankingState state, GameContext context) {
    return beginRound(state, context);
  }

  /** A diferencia del resto del lote, la fase se comprueba antes que el jugador. */
  @Override
  public GameActionResult<SecretRankingState> handleAction(SecretRankingState state, String playerId,
      SecretRankingAction action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La ronda ya está cerrada.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta ronda.");
    }
    boolean timeUp = Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt());
    if (timeUp) return GameActionResult.reject(state, "El tiempo ha terminado.");
    if (state.submissions().containsKey(playerId)) {
      return GameActionResult.reject(state, "Tu ranking ya está bloqueado.");
    }
    if (new HashSet<>(action.pokemonIds()).size() != 5
        || action.pokemonIds().stream().anyMatch(id -> !state.currentPokemonIds().contains(id))) {
      return GameActionResult.reject(state, "Ordena exactamente los cinco Pokémon de esta ronda.");
    }
    var submissions = new LinkedHashMap<>(state.submissions());
    submissions.put(playerId, action.pokemonIds());
    var next = state.toBuilder().submissions(submissions).build();
    return GameActionResult.accept(Timing.resolveWhenRequiredPlayersComplete(next, context, next.playerIds(),
        id -> next.submissions().containsKey(id), SecretRankingEngine::finishRound));
  }

  @Override
  public SecretRankingState handleTimeout(SecretRankingState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return finishRound(state, context);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && Timing.deadlineReached(context.now(), state.nextTransitionAt())) {
      return beginRound(state, context);
    }
    return state;
  }

  @Override
  public SecretRankingState handlePresenceChange(SecretRankingState state, GameContext context) {
    return Timing.resolveWhenRequiredPlayersComplete(state, context, state.playerIds(),
        id -> state.submissions().containsKey(id), SecretRankingEngine::finishRound);
  }

  @Override
  public SecretRankingPublicState getPublicState(SecretRankingState state, GameContext context) {
    return new SecretRankingPublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        promptText(state), pokemonForIds(state.currentPokemonIds(), context),
        new ArrayList<>(state.submissions().keySet()), state.scores(), state.roundEndsAt(), state.nextTransitionAt(),
        state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? SecretRankingRules.buildSecretRankingResults(state) : null);
  }

  @Override
  public SecretRankingPlayerState getPlayerState(SecretRankingState state, String playerId, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return SecretRankingPlayerState.SPECTATOR;
    }
    var ranking = state.submissions().get(playerId);
    return new SecretRankingPlayerState("PLAYER", state.phase() == GamePhase.ROUND_ACTIVE && ranking == null,
        ranking == null ? null : pokemonForIds(ranking, context));
  }

  @Override
  public GameLifecycle getLifecycle(SecretRankingState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(SecretRankingState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(SecretRankingState state) {
    return SecretRankingRules.buildSecretRankingResults(state);
  }
}
