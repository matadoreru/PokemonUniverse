package es.pokemonuniverse.domain.game.engines.shinyvote;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig.CandidateMode;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig.VoteVisibility;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyOptionId;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVoteAction;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVoteState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.support.EngineTestKit;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: errores de arranque, la sala ausente y la tabla de paletas completa. */
class ShinyVoteEngineTest {

  private final ShinyVoteEngine engine = new ShinyVoteEngine(GoldenManifests.of(ShinyVoteEngine.ID));

  private static GameContext context(int players) {
    return EngineTestKit.builder(players).roomCode("GOLD01").build();
  }

  private static ShinyVoteConfig config(List<Integer> generations, CandidateMode mode, int optionCount) {
    return new ShinyVoteConfig(generations, 20, 2, mode, optionCount, VoteVisibility.LIVE, 4, ShinyVoteMode.CLASSIC);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("shiny-vote", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  /** {@code revealSeconds} entre 3 y 6 (4 por defecto) fija la duración de la revelación. */
  @Test
  void revealLastsRevealSeconds() throws IOException {
    assertEquals(4, engine.defaultConfig().revealSeconds());
    var base = "{\"generations\":[1],\"roundSeconds\":20,\"rounds\":2,\"candidateMode\":\"SAME_POKEMON\","
        + "\"optionCount\":4,\"voteVisibility\":\"REVEAL\",\"revealSeconds\":";
    for (var invalid : List.of("2", "7", "4.5", "\"4\"")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseConfig(json(base + invalid + "}")), invalid);
    }
    var config = engine.parseConfig(json(base + "6}"));
    var context = context(1);
    var started = engine.start(engine.createInitialState(config, context), context);
    var revealed = engine.handleTimeout(started, context.toBuilder().now(started.roundEndsAt()).build());
    assertEquals(started.roundEndsAt() + 6_000, revealed.nextTransitionAt());
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new ShinyVoteEngine(other));
  }

  @Test
  void parsesTheStrictVoteAction() throws IOException {
    assertEquals(ShinyOptionId.F, engine.parseAction(json("{\"type\":\"VOTE\",\"optionId\":\"F\"}")).optionId());
    for (var invalid : List.of("{\"type\":\"VOTE\",\"optionId\":\"G\"}", "{\"type\":\"VOTE\",\"optionId\":\"a\"}",
        "{\"type\":\"VOTE\",\"optionId\":\"A\",\"extra\":1}", "{\"type\":\"vote\",\"optionId\":\"A\"}",
        "{\"type\":\"VOTE\"}", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** {@code runner.ts} no captura los errores de createInitialState/start: estos literales solo se prueban aquí. */
  @Test
  void creationErrorsUseTheServerLiterals() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), CandidateMode.SAME_POKEMON, 4), context(0)));
    assertEquals("At least 1 player is required", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(9), CandidateMode.SAME_POKEMON, 4), context(1)));
    assertEquals("At least 1 Pokémon are required for the selected generations", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(9), CandidateMode.DIFFERENT_POKEMON, 6), context(1)));
    assertEquals("At least 6 Pokémon are required for the selected generations", error.getMessage());
    var context = context(1);
    var initial = engine.createInitialState(config(List.of(1), CandidateMode.SAME_POKEMON, 4), context);
    assertEquals("rs", initial.assetToken());
    var started = engine.start(initial, context);
    error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("Game already started", error.getMessage());
    // Las generaciones del estado ya no tienen Pokémon: createOptions lanza el mismo literal.
    var emptied = initial.toBuilder().config(config(List.of(9), CandidateMode.SAME_POKEMON, 4)).build();
    error = assertThrows(EngineException.class, () -> engine.start(emptied, context));
    assertEquals("At least 1 Pokémon are required for the selected generations", error.getMessage());
  }

  /** {@code context.roomCode} falsy (nulo o vacío): el sprite real en lugar de la ruta opaca. */
  @Test
  void publishesTheRealSpriteWithoutRoomCode() {
    for (var roomCode : new String[] {null, ""}) {
      var context = context(1).toBuilder().roomCode(roomCode).build();
      var started = engine.start(
          engine.createInitialState(config(List.of(1), CandidateMode.SAME_POKEMON, 4), context), context);
      var options = engine.getPublicState(started, context).options();
      for (int index = 0; index < options.size(); index++) {
        assertEquals(started.options().get(index).sprite(), options.get(index).sprite());
      }
    }
  }

  /** Se precarga exactamente la resolución que servirá {@code resolveAsset}, también la de la primera ronda. */
  @Test
  void preloadsEveryOptionResolution() {
    var preloaded = new ArrayList<AssetResolution>();
    var context = context(1).toBuilder().preloadAsset(preloaded::add).build();
    var started = engine.start(
        engine.createInitialState(config(List.of(1), CandidateMode.DIFFERENT_POKEMON, 3), context), context);
    assertEquals(served(started, context), preloaded);
    var revealed = engine.handleTimeout(started, context.withNow(21_000));
    assertEquals(6, preloaded.size());
    var second = engine.handleTimeout(revealed, context.withNow(25_000));
    assertEquals(2, second.roundNumber());
    assertEquals(served(second, context), preloaded.subList(3, 6));
    assertTrue(preloaded.stream().noneMatch(asset -> asset.transform() == AssetResolution.Transform.ORIGINAL));
    // Tras la última ronda no se prepara ni se precarga nada.
    var last = engine.handleTimeout(second, context.withNow(45_000));
    assertEquals(null, last.preparedOptions());
    assertEquals(6, preloaded.size());
  }

  private List<AssetResolution> served(ShinyVoteTypes.ShinyVoteState state, GameContext context) {
    return state.options().stream().map(option -> engine.resolveAsset(state,
        new AssetRequest(state.assetToken(), state.roundNumber(), option.id().name()), context).orElseThrow()).toList();
  }

  @Test
  void palettesMatchTheTypeScriptLiteralAndWrapAround() {
    var expected = List.of("{\"hueShiftDegrees\":28,\"saturationScale\":0.9,\"lightnessScale\":1.02,\"contrast\":0.97}",
        "{\"hueShiftDegrees\":76,\"saturationScale\":0.82,\"lightnessScale\":0.99,\"contrast\":0.95}",
        "{\"hueShiftDegrees\":142,\"saturationScale\":0.86,\"lightnessScale\":1.01,\"contrast\":0.96}",
        "{\"hueShiftDegrees\":196,\"saturationScale\":0.8,\"lightnessScale\":1.03,\"contrast\":0.94}",
        "{\"hueShiftDegrees\":248,\"saturationScale\":0.84,\"lightnessScale\":0.98,\"contrast\":0.96}",
        "{\"hueShiftDegrees\":310,\"saturationScale\":0.88,\"lightnessScale\":1.02,\"contrast\":0.95}");
    for (int index = 0; index < 8; index++) {
      try {
        assertTrue(JsonTree.equal(json(expected.get(index % 6)),
            GoldenReplayer.tree(ShinyVoteFilters.fakeShinyPalette(ShinyVoteFilters.FAKE_SHINY_PALETTES, index))),
            "paleta " + index);
      } catch (IOException e) {
        throw new AssertionError(e);
      }
    }
    assertTrue(ShinyVoteFilters.useShinySpriteForFake(() -> 0.349));
    assertFalse(ShinyVoteFilters.useShinySpriteForFake(() -> 0.35));
  }

  private static Pokemon withoutShinySprite(Pokemon p) {
    return new Pokemon(p.id(), p.nationalDexNumber(), p.name(), p.generation(), p.isDefault(), p.sprite(), null,
        p.palette(), p.paletteWeights(), p.hp(), p.attack(), p.defense(), p.specialAttack(), p.specialDefense(),
        p.speed(), p.baseStatTotal(), p.heightDecimeters(), p.weightHectograms(), p.evolutionStage(),
        p.evolutionStageCount(), p.legendaryStatus(), p.color(), p.abilities(), p.names(), p.types());
  }

  /** El catálogo dorado tiene shiny en todos: el filtro del pool solo se prueba con un catálogo propio, como el TS. */
  @Test
  void neverUsesAPokemonWithoutShinySprite() {
    var gen1 = GoldenCatalogs.load("gen1-2").forGenerations(List.of(1)).subList(0, 6);
    var mixed = new ArrayList<Pokemon>();
    for (int index = 0; index < gen1.size(); index++) {
      mixed.add(index == 3 ? gen1.get(index) : withoutShinySprite(gen1.get(index)));
    }
    var withShiny = gen1.get(3).id();
    var context = GameContext.builder(new InMemoryPokemonCatalog(mixed), () -> 0.99)
        .players(List.of(new GamePlayer("p1", "Player 1"))).now(1000).roomCode("GOLD01").build();
    var config = new ShinyVoteConfig(List.of(1), 20, 3, CandidateMode.SAME_POKEMON, 4, VoteVisibility.REVEAL, 4, ShinyVoteMode.CLASSIC);
    var started = engine.start(engine.createInitialState(config, context), context);
    assertTrue(started.options().stream().allMatch(option -> option.pokemonId().equals(withShiny)));
    var revealed = engine.handleTimeout(started, context.withNow(started.roundEndsAt()));
    assertTrue(revealed.preparedOptions().stream().allMatch(option -> option.pokemonId().equals(withShiny)));
    var different = new ShinyVoteConfig(List.of(1), 20, 3, CandidateMode.DIFFERENT_POKEMON, 4, VoteVisibility.REVEAL, 4, ShinyVoteMode.CLASSIC);
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(different, context));
    assertEquals("At least 4 Pokémon are required for the selected generations", error.getMessage());
  }

  // ---- Supervivencia (SURVIVAL) ----

  private static ShinyVoteConfig survival(int optionCount, int rounds) {
    return new ShinyVoteConfig(List.of(1, 2), 20, rounds, CandidateMode.DIFFERENT_POKEMON, optionCount,
        VoteVisibility.REVEAL, 4, ShinyVoteMode.SURVIVAL);
  }

  private static GamePlayer[] players(int count) {
    return EngineTestKit.players(count).toArray(GamePlayer[]::new);
  }

  private static GameContext at(long now, GamePlayer... players) {
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(11)).players(List.of(players)).now(now)
        .roomCode("GOLD01").build();
  }

  private static ShinyOptionId wrong(ShinyVoteState state) {
    return state.options().stream().map(option -> option.id()).filter(id -> id != state.correctOptionId())
        .findFirst().orElseThrow();
  }

  private ShinyVoteState vote(ShinyVoteState state, String playerId, ShinyOptionId optionId, GameContext context) {
    var result = engine.handleAction(state, playerId, new ShinyVoteAction(optionId), context);
    assertTrue(result.accepted(), () -> "rechazado: " + result.error());
    return result.state();
  }

  /** Del revelado a la ronda siguiente (o al final), en el plazo del servidor. */
  private ShinyVoteState next(ShinyVoteState state, GamePlayer... players) {
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    return engine.handleTimeout(state, at(state.nextTransitionAt(), players));
  }

  @Test
  void optionCountGrowsEveryThreeRounds() {
    var players = players(1);
    var context = GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(11)).players(List.of(players))
        .now(1_000).roomCode("GOLD01").build();
    var preloaded = new ArrayList<AssetResolution>();
    context = context.toBuilder().preloadAsset(preloaded::add).build();
    var state = engine.start(engine.createInitialState(survival(5, 10), context), context);
    var sizes = new ArrayList<Integer>();
    for (int round = 1; round <= 7; round++) {
      assertEquals(round, state.roundNumber());
      sizes.add(state.options().size());
      assertEquals(state.options().size(), engine.getPublicState(state, context).options().size());
      // Lo último precargado es justo lo que sirve la ronda; la letra siguiente no existe.
      int size = state.options().size();
      assertEquals(served(state, context), preloaded.subList(preloaded.size() - size, preloaded.size()));
      var missing = ShinyOptionId.values()[state.options().size()].name();
      assertTrue(engine.resolveAsset(state, new AssetRequest(state.assetToken(), round, missing), context).isEmpty());
      var playing = context.withNow(state.roundStartedAt() + 1);
      state = vote(state, "p1", state.correctOptionId(), playing);
      state = next(state, players);
    }
    assertEquals(List.of(3, 3, 3, 4, 4, 4, 5), sizes);
    // Clásico: siempre optionCount.
    var classic = new ShinyVoteConfig(List.of(1, 2), 20, 10, CandidateMode.DIFFERENT_POKEMON, 5, VoteVisibility.REVEAL,
        4, ShinyVoteMode.CLASSIC);
    var started = engine.start(engine.createInitialState(classic, context), context);
    assertEquals(5, started.options().size());
  }

  @Test
  void wrongOrNoVoteEliminates() {
    var players = players(3);
    var context = at(1_000, players);
    var state = engine.start(engine.createInitialState(survival(4, 10), context), context);
    state = vote(state, "p1", state.correctOptionId(), context);
    state = vote(state, "p2", wrong(state), context);
    state = engine.handleTimeout(state, at(state.roundEndsAt(), players));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    var view = engine.getPublicState(state, context);
    assertEquals(ShinyVoteMode.SURVIVAL, view.mode());
    assertEquals(List.of("p1"), view.alive());
    assertEquals(Map.of("p1", 1, "p2", 0, "p3", 0), view.roundsSurvived());
    assertEquals(List.of("p2", "p3"), state.lastRound().missedPlayerIds());
    assertEquals(1, engine.getPlayerState(state, "p1", context).roundResult().points());
    state = next(state, players);
    var later = at(state.roundStartedAt() + 1, players);
    assertFalse(engine.getPlayerState(state, "p2", later).canVote());
    assertTrue(engine.getPlayerState(state, "p1", later).canVote());
    var rejected = engine.handleAction(state, "p3", new ShinyVoteAction(ShinyOptionId.A), later);
    assertFalse(rejected.accepted());
    assertEquals("Estás eliminado.", rejected.error());
    assertEquals(List.of("p1"), engine.getPublicState(state, later).pendingPlayerIds());
    // Completa la ronda quien sigue en pie: los eliminados conectados no la bloquean.
    state = vote(state, "p1", state.correctOptionId(), later);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of(), state.lastRound().missedPlayerIds());
    assertEquals(Map.of("p1", 2, "p2", 0, "p3", 0), state.scores());
  }

  @Test
  void endsWhenNobodyAliveOrAfterRounds() {
    var players = players(2);
    var context = at(1_000, players);
    var state = engine.start(engine.createInitialState(survival(4, 10), context), context);
    state = vote(state, "p1", state.correctOptionId(), context);
    state = vote(state, "p2", wrong(state), context);
    state = next(state, players);
    state = engine.handleTimeout(state, at(state.roundEndsAt(), players));
    assertEquals(List.of(), state.alive());
    // Sin nadie en pie no se prepara la ronda siguiente.
    assertNull(state.preparedOptions());
    state = next(state, players);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertEquals(2, state.roundNumber());

    var survivor = engine.start(engine.createInitialState(survival(4, 2), context), context);
    for (int round = 1; round <= 2; round++) {
      survivor = vote(survivor, "p1", survivor.correctOptionId(), context.withNow(survivor.roundStartedAt() + 1));
      // En la ronda 1 falta p2 (cae por tiempo); en la 2 ya solo juega p1 y su voto la cierra.
      if (survivor.phase() == GamePhase.ROUND_ACTIVE) {
        survivor = engine.handleTimeout(survivor, at(survivor.roundEndsAt(), players));
      }
      survivor = next(survivor, players);
    }
    assertEquals(GamePhase.GAME_RESULTS, survivor.phase());
    assertEquals(List.of("p1"), survivor.alive());
    assertEquals("p1", engine.getResults(survivor).winnerId());
  }

  @Test
  void allEliminatedSameRoundTie() {
    var players = players(3);
    var context = at(1_000, players);
    var state = engine.start(engine.createInitialState(survival(4, 10), context), context);
    for (var id : List.of("p1", "p2", "p3")) state = vote(state, id, state.correctOptionId(), context);
    state = next(state, players);
    var later = context.withNow(state.roundStartedAt() + 1);
    state = vote(state, "p1", wrong(state), later);
    state = vote(state, "p2", wrong(state), later);
    state = engine.handleTimeout(state, at(state.roundEndsAt(), players));
    state = next(state, players);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    var results = engine.getResults(state);
    assertNull(results.winnerId());
    assertEquals(List.of(1, 1, 1), results.standings().stream().map(GameStanding::position).toList());
    assertEquals(List.of(1, 1, 1), results.standings().stream().map(GameStanding::points).toList());
  }

  @Test
  void disconnectAfterGraceCountsAsFail() {
    var players = players(2);
    var context = at(1_000, players);
    var state = engine.start(engine.createInitialState(survival(4, 10), context), context);
    state = vote(state, "p1", state.correctOptionId(), context);
    // p2 pierde la gracia (active:false) sin votar: la ronda se resuelve por presencia y cae.
    var gone = new GamePlayer[] {players[0], new GamePlayer("p2", "Player 2", false, false)};
    state = engine.handlePresenceChange(state, at(2_000, gone));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of("p1"), state.alive());
    state = next(state, gone);
    // Si también se va el último en pie, la ronda se resuelve sin nadie y la partida acaba.
    var nobody = new GamePlayer[] {new GamePlayer("p1", "Player 1", false, false), gone[1]};
    state = engine.handlePresenceChange(state, at(state.roundStartedAt() + 1, nobody));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of(), state.alive());
    state = next(state, nobody);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
  }

  @Test
  void resultsRankByRoundsSurvived() {
    var players = players(3);
    var context = at(1_000, players);
    var state = engine.start(engine.createInitialState(survival(4, 10), context), context);
    // R1: p3 vota primero y acierta; p2 tarde y acierta; p1 falla.
    state = vote(state, "p3", state.correctOptionId(), context.withNow(1_100));
    state = vote(state, "p2", state.correctOptionId(), context.withNow(1_200));
    state = vote(state, "p1", wrong(state), context.withNow(1_300));
    state = next(state, players);
    // R2: p2 acierta; p3 (el más rápido en R1) falla.
    var later = context.withNow(state.roundStartedAt() + 1);
    state = vote(state, "p3", wrong(state), later);
    state = vote(state, "p2", state.correctOptionId(), later.withNow(state.roundStartedAt() + 2));
    state = next(state, players);
    // R3: p2 falla.
    state = vote(state, "p2", wrong(state), context.withNow(state.roundStartedAt() + 1));
    state = next(state, players);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    var results = engine.getResults(state);
    assertEquals("p2", results.winnerId());
    assertEquals(List.of("p2", "p3", "p1"), results.standings().stream().map(GameStanding::playerId).toList());
    assertEquals(List.of(2, 1, 0), results.standings().stream().map(GameStanding::points).toList());
    assertEquals(List.of(1, 2, 3), results.standings().stream().map(GameStanding::position).toList());
    // Ninguna ronda quedó sin voto: unanswered cuenta solo las rondas en que siguió en pie.
    assertEquals(0, results.standings().getFirst().stats().get("unanswered").intValue());
  }
}
