package es.pokemonuniverse.domain.game.engines.oneofusisfake;

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
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeConfig.CategorySource;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.FakePokemonChoice;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.FakeRevealedChoice;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.FakeRoundPlayer;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.FakeRoundResult;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.FakeVoteRound;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.FakeWinner;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeAction;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakePlayerState;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakePublicState;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeSpectatorState;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeState;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeStats;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Traducción literal de {@code one-of-us-is-fake/server.ts}. */
public final class OneOfUsIsFakeEngine
    implements GameEngine<OneOfUsIsFakeConfig, OneOfUsIsFakeState, OneOfUsIsFakeAction, OneOfUsIsFakePublicState> {

  public static final String ID = "one-of-us-is-fake";
  /** {@code FAKE_CHOICE_REVEAL_MS}. */
  public static final long CHOICE_REVEAL_MS = 650;
  /** {@code FAKE_ROUND_RESULT_MS}. */
  public static final long ROUND_RESULT_MS = 6_000;

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public OneOfUsIsFakeEngine(GameManifest manifest) {
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
  public OneOfUsIsFakeConfig parseConfig(JsonNode raw) {
    return OneOfUsIsFakeConfig.parse(raw);
  }

  @Override
  public OneOfUsIsFakeAction parseAction(JsonNode raw) {
    return OneOfUsIsFakeAction.parse(raw);
  }

  @Override
  public OneOfUsIsFakeConfig defaultConfig() {
    return OneOfUsIsFakeConfig.defaults();
  }

  /** Oficiales y del host, estas con el id {@code custom-…} ({@code { ...category, id }} conserva su posición). */
  private static List<SubjectiveCategory> categoryPool(OneOfUsIsFakeConfig config, GameContext context) {
    var pool = new ArrayList<SubjectiveCategory>();
    if (config.categorySource() != CategorySource.CUSTOM) pool.addAll(OneOfUsIsFakeCategories.OFFICIAL);
    if (config.categorySource() != CategorySource.OFFICIAL) {
      for (var category : context.hostCustomCategories()) {
        pool.add(new SubjectiveCategory("custom-" + category.id(), category.text()));
      }
    }
    return pool;
  }

  private record ChosenCategories(SubjectiveCategory main, SubjectiveCategory fake, List<String> used) {}

  /**
   * Consume dos extracciones de {@code random}: la principal entre las no usadas y la del fake entre las no usadas
   * restantes (o, si no quedan, entre todas menos la principal). Las usadas se vacían al completar el pool.
   */
  private static ChosenCategories chooseCategories(OneOfUsIsFakeState state, GameContext context) {
    var unused = state.categoryPool().stream()
        .filter(category -> !state.usedCategoryIds().contains(category.id()))
        .toList();
    var firstPool = !unused.isEmpty() ? unused : state.categoryPool();
    var main = firstPool.get((int) Math.floor(context.random().getAsDouble() * firstPool.size()));
    var remainingUnused = unused.stream().filter(category -> !category.id().equals(main.id())).toList();
    var secondPool = !remainingUnused.isEmpty() ? remainingUnused
        : state.categoryPool().stream().filter(category -> !category.id().equals(main.id())).toList();
    var fake = secondPool.get((int) Math.floor(context.random().getAsDouble() * secondPool.size()));
    var used = new LinkedHashSet<>(state.usedCategoryIds());
    used.add(main.id());
    used.add(fake.id());
    return new ChosenCategories(main, fake,
        used.size() == state.categoryPool().size() ? List.of() : List.copyOf(used));
  }

  private static String categoryText(OneOfUsIsFakeState state, @Nullable String id) {
    return state.categoryPool().stream()
        .filter(category -> category.id().equals(id))
        .findFirst()
        .map(SubjectiveCategory::text)
        .orElse("");
  }

  /** Consume, en orden: las dos categorías, el jugador fake y la baraja del orden de revelado. */
  private static OneOfUsIsFakeState beginRound(OneOfUsIsFakeState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    var categories = chooseCategories(state, context);
    var fakePlayerId = state.playerIds().get(
        (int) Math.floor(context.random().getAsDouble() * state.playerIds().size()));
    var stats = new LinkedHashMap<String, OneOfUsIsFakeStats>();
    for (var playerId : state.playerIds()) {
      var current = OneOfUsIsFakeRules.statsOf(state, playerId);
      stats.put(playerId, playerId.equals(fakePlayerId) ? current.asFake() : current);
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(state.roundNumber() + 1)
        .fakePlayerId(fakePlayerId)
        .mainCategoryId(categories.main().id())
        .fakeCategoryId(categories.fake().id())
        .usedCategoryIds(categories.used())
        .selections(Map.of())
        .revealOrder(Randoms.shuffled(state.playerIds(), context.random()))
        .revealedCount(0)
        .votes(Map.of())
        .voteCandidates(state.playerIds())
        .voteRoundNumber(1)
        .voteHistory(List.of())
        .playerStats(stats)
        .roundEndsAt(context.now() + state.config().selectionSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static OneOfUsIsFakeState beginReveal(OneOfUsIsFakeState state, GameContext context) {
    return state.toBuilder()
        .phase(GamePhase.CHOICE_REVEAL)
        .revealedCount(0)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + CHOICE_REVEAL_MS)
        .build();
  }

  /** Revela una elección por paso; tras la última empieza la discusión. */
  private static OneOfUsIsFakeState advanceReveal(OneOfUsIsFakeState state, GameContext context) {
    int nextCount = state.revealedCount() + 1;
    if (nextCount < state.revealOrder().size()) {
      return state.toBuilder().revealedCount(nextCount).nextTransitionAt(context.now() + CHOICE_REVEAL_MS).build();
    }
    return state.toBuilder()
        .phase(GamePhase.DISCUSSION)
        .revealedCount(state.revealOrder().size())
        .roundEndsAt(context.now() + state.config().discussionSeconds() * 1_000L)
        .nextTransitionAt(null)
        .build();
  }

  private static boolean allEligibleVoted(OneOfUsIsFakeState state, GameContext context) {
    return state.playerIds().stream()
        .filter(context::isPlayerRequired)
        .allMatch(playerId -> JsStrings.truthy(state.votes().get(playerId)));
  }

  private static FakeVoteRound currentVoteRound(OneOfUsIsFakeState state) {
    return new FakeVoteRound(state.voteRoundNumber(), state.voteCandidates(), state.votes());
  }

  private static OneOfUsIsFakeState finishRound(OneOfUsIsFakeState state, String selectedPlayerId,
      GameContext context) {
    var fakePlayerId = Objects.requireNonNull(state.fakePlayerId(), "fakePlayerId");
    boolean normalsWin = selectedPlayerId.equals(fakePlayerId);
    var pointsAwarded = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      boolean isFake = playerId.equals(fakePlayerId);
      pointsAwarded.put(playerId, normalsWin
          ? (isFake ? 0 : OneOfUsIsFakeRules.NORMAL_ROUND_POINTS)
          : (isFake ? OneOfUsIsFakeRules.FAKE_ROUND_POINTS : 0));
    }
    var scores = new LinkedHashMap<String, Integer>();
    for (var playerId : state.playerIds()) {
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + pointsAwarded.getOrDefault(playerId, 0));
    }
    var playerStats = new LinkedHashMap<String, OneOfUsIsFakeStats>();
    for (var playerId : state.playerIds()) {
      playerStats.put(playerId, OneOfUsIsFakeRules.statsOf(state, playerId)
          .afterRound(playerId.equals(fakePlayerId), normalsWin, playerId.equals(selectedPlayerId)));
    }
    var voteHistory = new ArrayList<>(state.voteHistory());
    voteHistory.add(currentVoteRound(state));
    var players = state.playerIds().stream()
        .map(playerId -> new FakeRoundPlayer(playerId,
            categoryText(state, playerId.equals(fakePlayerId) ? state.fakeCategoryId() : state.mainCategoryId()),
            state.selections().get(playerId), playerId.equals(fakePlayerId)))
        .toList();
    var winner = normalsWin ? FakeWinner.NORMALS : FakeWinner.FAKE;
    var lastRound = new FakeRoundResult(fakePlayerId, selectedPlayerId, winner,
        categoryText(state, state.mainCategoryId()), categoryText(state, state.fakeCategoryId()), players, voteHistory,
        pointsAwarded);
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .votes(Map.of())
        .voteHistory(voteHistory)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + ROUND_RESULT_MS)
        .lastRound(lastRound)
        .build();
  }

  /**
   * Un único más votado queda expulsado. En el desempate, si vuelven a empatar todos los candidatos, se expulsa a uno
   * al azar (una extracción de {@code random}); si no, otra votación entre los empatados.
   */
  private static OneOfUsIsFakeState resolveVote(OneOfUsIsFakeState state, GameContext context) {
    var recorded = currentVoteRound(state);
    var tallies = new LinkedHashMap<String, Integer>();
    for (var candidate : state.voteCandidates()) tallies.put(candidate, 0);
    for (var target : state.votes().values()) {
      if (tallies.containsKey(target)) tallies.put(target, tallies.get(target) + 1);
    }
    int maximum = tallies.values().stream().mapToInt(Integer::intValue).max().orElseThrow();
    var tied = state.voteCandidates().stream().filter(candidate -> tallies.get(candidate) == maximum).toList();
    if (tied.size() == 1) return finishRound(state, tied.getFirst(), context);
    if (state.phase() == GamePhase.REVOTE && tied.size() == state.voteCandidates().size()) {
      return finishRound(state, tied.get((int) Math.floor(context.random().getAsDouble() * tied.size())), context);
    }
    var history = new ArrayList<>(state.voteHistory());
    history.add(recorded);
    return state.toBuilder()
        .phase(GamePhase.REVOTE)
        .votes(Map.of())
        .voteCandidates(tied)
        .voteRoundNumber(state.voteRoundNumber() + 1)
        .voteHistory(history)
        .roundEndsAt(context.now() + state.config().discussionSeconds() * 1_000L)
        .nextTransitionAt(null)
        .build();
  }

  /** Sin mínimo de jugadores ni filtro de imagen: solo el pool de generaciones y dos categorías. */
  @Override
  public OneOfUsIsFakeState createInitialState(OneOfUsIsFakeConfig config, GameContext context) {
    var pool = context.pokemon().forGenerations(config.generations(), config.includeRegionalForms());
    if (pool.isEmpty()) throw new EngineException("No hay Pokémon disponibles con esta configuración.");
    var categories = categoryPool(config, context);
    if (categories.size() < 2) {
      throw new EngineException("Se necesitan al menos 2 categorías activas para iniciar la partida.");
    }
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, OneOfUsIsFakeStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, OneOfUsIsFakeStats.ZERO);
    }
    return OneOfUsIsFakeState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .poolIds(pool.stream().map(Pokemon::id).toList())
        .categoryPool(categories)
        .roundNumber(0)
        .revealedCount(0)
        .voteRoundNumber(1)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public OneOfUsIsFakeState start(OneOfUsIsFakeState state, GameContext context) {
    return beginRound(state, context);
  }

  /** El plazo vencido se comprueba antes que la participación: un jugador desconectado también recibe ese error. */
  @Override
  public GameActionResult<OneOfUsIsFakeState> handleAction(OneOfUsIsFakeState state, String playerId,
      OneOfUsIsFakeAction action, GameContext context) {
    boolean timedPhase = state.phase() == GamePhase.ROUND_ACTIVE || state.phase() == GamePhase.DISCUSSION
        || state.phase() == GamePhase.REVOTE;
    if (timedPhase && Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(state, "El tiempo ha terminado.");
    }
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes actuar en esta ronda.");
    }
    if (action instanceof OneOfUsIsFakeAction.SelectPokemon select) {
      if (state.phase() != GamePhase.ROUND_ACTIVE) {
        return GameActionResult.reject(state, "La selección ya ha terminado.");
      }
      var pokemon = context.pokemon().byId(select.pokemonId());
      if (pokemon.isEmpty() || !state.poolIds().contains(pokemon.get().id())) {
        return GameActionResult.reject(state, "Ese Pokémon no pertenece al pool configurado.");
      }
      var found = pokemon.get();
      var selections = new LinkedHashMap<>(state.selections());
      selections.put(playerId, new FakePokemonChoice(found.id(), found.name(), found.sprite()));
      var next = state.toBuilder().selections(selections).build();
      return GameActionResult.accept(
          context.allConnectedRequiredCompleted(state.playerIds(), id -> next.selections().containsKey(id))
              ? beginReveal(next, context)
              : next);
    }
    var vote = (OneOfUsIsFakeAction.VotePlayer) action;
    if (state.phase() != GamePhase.DISCUSSION && state.phase() != GamePhase.REVOTE) {
      return GameActionResult.reject(state, "La votación no está activa.");
    }
    if (vote.playerId().equals(playerId)) return GameActionResult.reject(state, "No puedes votarte a ti mismo.");
    if (!state.voteCandidates().contains(vote.playerId())) {
      return GameActionResult.reject(state, "Ese jugador no es candidato en esta votación.");
    }
    if (JsStrings.truthy(state.votes().get(playerId))) return GameActionResult.reject(state, "Tu voto ya está bloqueado.");
    var current = OneOfUsIsFakeRules.statsOf(state, playerId);
    var votes = new LinkedHashMap<>(state.votes());
    votes.put(playerId, vote.playerId());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, current.afterVote(vote.playerId().equals(state.fakePlayerId())));
    var next = state.toBuilder().votes(votes).playerStats(playerStats).build();
    return GameActionResult.accept(allEligibleVoted(next, context) ? resolveVote(next, context) : next);
  }

  @Override
  public OneOfUsIsFakeState handleTimeout(OneOfUsIsFakeState state, GameContext context) {
    boolean roundDeadline = Timing.deadlineReached(context.now(), state.roundEndsAt());
    boolean transitionDue = Timing.deadlineReached(context.now(), state.nextTransitionAt());
    if (state.phase() == GamePhase.ROUND_ACTIVE && roundDeadline) return beginReveal(state, context);
    if (state.phase() == GamePhase.CHOICE_REVEAL && transitionDue) return advanceReveal(state, context);
    if ((state.phase() == GamePhase.DISCUSSION || state.phase() == GamePhase.REVOTE) && roundDeadline) {
      return resolveVote(state, context);
    }
    if (state.phase() == GamePhase.ROUND_RESULTS && transitionDue) return beginRound(state, context);
    return state;
  }

  @Override
  public OneOfUsIsFakeState handlePresenceChange(OneOfUsIsFakeState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE
        && context.allConnectedRequiredCompleted(state.playerIds(), id -> state.selections().containsKey(id))) {
      return beginReveal(state, context);
    }
    if ((state.phase() == GamePhase.DISCUSSION || state.phase() == GamePhase.REVOTE)
        && allEligibleVoted(state, context)) {
      return resolveVote(state, context);
    }
    return state;
  }

  @Override
  public OneOfUsIsFakePublicState getPublicState(OneOfUsIsFakeState state, GameContext context) {
    var revealedIds = new HashSet<>(state.revealOrder().subList(0, Math.min(state.revealedCount(),
        state.revealOrder().size())));
    var revealedChoices = new ArrayList<FakeRevealedChoice>();
    for (var playerId : state.revealOrder()) {
      var choice = state.selections().get(playerId);
      if (revealedIds.contains(playerId) && choice != null) {
        revealedChoices.add(new FakeRevealedChoice(playerId, choice));
      }
    }
    return new OneOfUsIsFakePublicState(ID, state.phase(), state.roundNumber(), state.config().rounds(),
        state.playerIds(), new ArrayList<>(state.selections().keySet()), revealedChoices,
        new ArrayList<>(state.votes().keySet()), state.voteCandidates(), state.voteRoundNumber(), state.scores(),
        state.roundEndsAt(), state.nextTransitionAt(),
        state.phase() == GamePhase.ROUND_RESULTS ? state.lastRound() : null,
        state.phase() == GamePhase.GAME_RESULTS ? OneOfUsIsFakeRules.buildOneOfUsIsFakeResults(state) : null);
  }

  /** {@code SPECTATOR} solo lleva {@code role}; {@code isFake} aparece solo si el fake lo sabe. */
  @Override
  public Object getPlayerState(OneOfUsIsFakeState state, String playerId, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return OneOfUsIsFakeSpectatorState.INSTANCE;
    }
    boolean isFake = playerId.equals(state.fakePlayerId());
    return new OneOfUsIsFakePlayerState(
        "PLAYER",
        categoryText(state, isFake ? state.fakeCategoryId() : state.mainCategoryId()),
        state.selections().get(playerId),
        state.phase() == GamePhase.ROUND_ACTIVE,
        (state.phase() == GamePhase.DISCUSSION || state.phase() == GamePhase.REVOTE)
            && !JsStrings.truthy(state.votes().get(playerId)),
        state.votes().get(playerId),
        state.config().fakeKnows() && isFake ? Boolean.TRUE : null);
  }

  @Override
  public GameLifecycle getLifecycle(OneOfUsIsFakeState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundNumber(state.roundNumber())
        .voteRoundNumber(state.voteRoundNumber())
        .build();
  }

  @Override
  public boolean isFinished(OneOfUsIsFakeState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(OneOfUsIsFakeState state) {
    return OneOfUsIsFakeRules.buildOneOfUsIsFakeResults(state);
  }
}
