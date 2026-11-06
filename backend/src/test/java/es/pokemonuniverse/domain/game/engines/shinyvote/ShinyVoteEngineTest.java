package es.pokemonuniverse.domain.game.engines.shinyvote;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig.CandidateMode;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig.VoteVisibility;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyOptionId;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: errores de arranque, la sala ausente y la tabla de paletas completa. */
class ShinyVoteEngineTest {

  private final ShinyVoteEngine engine = new ShinyVoteEngine(GoldenManifests.of(ShinyVoteEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000)
        .roomCode("GOLD01").build();
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

  @Test
  void takeRandomDrawsWithoutReplacement() {
    var draws = new double[] {0.99, 0.0, 0.5};
    var counter = new int[1];
    var picked = ShinyVoteEngine.takeRandom(List.of("a", "b", "c", "d"), 3, () -> draws[counter[0]++]);
    assertEquals(List.of("d", "a", "c"), picked);
    assertEquals(List.of("a", "b"), ShinyVoteEngine.takeRandom(List.of("a", "b"), 5, () -> 0.0));
  }
}
