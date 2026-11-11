package es.pokemonuniverse.domain.game.engines.whosthatpokemon;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonAction;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonSolve;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.support.EngineTestKit;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque y ramas inalcanzables. */
class WhosThatPokemonEngineTest {

  private final WhosThatPokemonEngine engine = new WhosThatPokemonEngine(GoldenManifests.of(WhosThatPokemonEngine.ID));

  private static GameContext context(int players) {
    return EngineTestKit.builder(players).roomCode("GOLD01").build();
  }

  private static WhosThatPokemonConfig config(List<Integer> generations) {
    return new WhosThatPokemonConfig(generations, 20, 3, false, false, true, false);
  }

  private static Pokemon withSprite(Pokemon pokemon, String sprite) {
    return new Pokemon(pokemon.id(), pokemon.nationalDexNumber(), pokemon.name(), pokemon.generation(),
        pokemon.isDefault(), sprite, pokemon.shinySprite(), pokemon.palette(), pokemon.paletteWeights(), pokemon.hp(),
        pokemon.attack(), pokemon.defense(), pokemon.specialAttack(), pokemon.specialDefense(), pokemon.speed(),
        pokemon.baseStatTotal(), pokemon.heightDecimeters(), pokemon.weightHectograms(), pokemon.evolutionStage(),
        pokemon.evolutionStageCount(), pokemon.legendaryStatus(), pokemon.color(), pokemon.abilities(),
        pokemon.names(), pokemon.types());
  }

  /** Juega {@code rounds} rondas: {@code p1} acierta las marcadas a los 2 s y {@code p2} no acierta ninguna. */
  private List<WhosThatPokemonSolve> playP1(boolean streakBonus, List<Boolean> p1Solves,
      List<Integer> streaksSeen) {
    var context = context(2);
    var config = new WhosThatPokemonConfig(List.of(1), 20, p1Solves.size(), false, false, true, streakBonus);
    var state = engine.start(engine.createInitialState(config, context), context);
    var solves = new ArrayList<WhosThatPokemonSolve>();
    for (boolean solves1 : p1Solves) {
      var now = context.withNow(state.roundStartedAt() + 2_000);
      streaksSeen.add(engine.getPlayerState(state, "p1", now).streak());
      if (solves1) {
        state = engine.handleAction(state, "p1", new WhosThatPokemonAction(state.targetPokemonId()), now).state();
        solves.add(state.solves().get("p1"));
      }
      state = engine.handleTimeout(state, context.withNow(state.roundEndsAt()));
      assertEquals(GamePhase.ROUND_RESULTS, state.phase());
      state = engine.handleTimeout(state, context.withNow(state.nextTransitionAt()));
    }
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    return solves;
  }

  /** E6: la racha suma +1 en el segundo acierto seguido, +2 en el tercero y +3 desde el cuarto; fallar la rompe. */
  @Test
  void streakBonusGrowsUpToThreeAndBreaksOnAMiss() {
    var streaks = new ArrayList<Integer>();
    var solves = playP1(true, List.of(true, true, true, true, true, false, true), streaks);
    assertEquals(List.of(0, 1, 2, 3, 3, 0), solves.stream().map(WhosThatPokemonSolve::streakBonus).toList());
    for (var solve : solves) {
      assertEquals(solve.speedPoints() + solve.placementBonus() + solve.streakBonus(), solve.points());
    }
    // Lo que ve p1 al empezar cada ronda: sus aciertos seguidos hasta la anterior.
    assertEquals(List.of(0, 1, 2, 3, 4, 5, 0), streaks);
  }

  @Test
  void withoutStreakBonusNothingChanges() {
    var streaks = new ArrayList<Integer>();
    var solves = playP1(false, List.of(true, true, true), streaks);
    for (var solve : solves) {
      assertEquals(null, solve.streakBonus());
      assertEquals(solve.speedPoints() + solve.placementBonus(), solve.points());
    }
    assertEquals(Arrays.asList(null, null, null), streaks);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("whos-that-pokemon", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new WhosThatPokemonEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    var longest = "x".repeat(96);
    assertEquals(longest,
        engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":25}", "{\"type\":\"guess_pokemon\",\"pokemonId\":\"pikachu\"}",
        "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** {@code runner.ts} no captura los errores de createInitialState/start: estos literales solo se prueban aquí. */
  @Test
  void creationErrorsUseTheServerLiterals() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(1)), context(0)));
    assertEquals("Se necesitan al menos 1 jugadores.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(9)), context(1)));
    assertEquals("No hay Pokémon con sprites válidos en las generaciones seleccionadas.", error.getMessage());
    var context = context(1);
    var started = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
  }

  @Test
  void preloadsTheTargetSpriteOnlyWhenTheContextHasPreload() {
    var preloaded = new ArrayList<String>();
    var context = context(1).toBuilder().preloadImage(preloaded::add).build();
    var started = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    assertEquals(List.of(context.pokemon().byId(started.targetPokemonId()).orElseThrow().sprite()), preloaded);
  }

  /** Estados que el flujo público no produce: el pool o el objetivo desaparecen del catálogo. */
  @Test
  void missingPokemonUseTheServerLiterals() {
    var context = context(1);
    var initial = engine.createInitialState(config(List.of(1)), context);
    var emptyPool = initial.toBuilder().poolIds(List.of("missingno")).build();
    var error = assertThrows(EngineException.class, () -> engine.start(emptyPool, context));
    assertEquals("No hay Pokémon con sprites válidos para esta configuración.", error.getMessage());
    var lost = engine.start(initial, context).toBuilder().targetPokemonId("missingno").build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(lost, context.withNow(21_000)));
    assertEquals("El Pokémon objetivo ya no está disponible.", error.getMessage());
    var request = new AssetRequest(lost.assetToken(), lost.roundNumber(), "shadow");
    assertTrue(engine.resolveAsset(lost, request, context).isEmpty());
    assertEquals(null, engine.getPublicState(lost, context).silhouetteSprite());
  }

  @Test
  void usesTheOpaqueRoomWithoutRoomCode() {
    var context = context(1).toBuilder().roomCode(null).build();
    var started = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    assertEquals("/api/rooms/opaque/games/" + started.assetToken() + "/rounds/1/options/shadow/sprite",
        engine.getPublicState(started, context).silhouetteSprite());
  }

  @Test
  void acceptsOnlyHttpsGithubPngOrWebpSprites() {
    var pikachu = GoldenCatalogs.load("gen1-2").byId("pikachu").orElseThrow();
    assertTrue(WhosThatPokemonRules.isUsableWhoPokemonSprite(pikachu));
    assertTrue(WhosThatPokemonRules.isUsableWhoPokemonSprite(
        withSprite(pikachu, "HTTPS://Raw.GitHubUserContent.com/PokeAPI/sprites/25.WEBP")));
    for (var sprite : List.of("http://raw.githubusercontent.com/PokeAPI/sprites/25.png",
        "https://example.com/25.png", "https://raw.githubusercontent.com/PokeAPI/sprites/25.gif",
        "https://raw.githubusercontent.com/PokeAPI/sprites/25.gif?x=.png",
        "/sprites/25.png", "no es una url", "")) {
      assertFalse(WhosThatPokemonRules.isUsableWhoPokemonSprite(withSprite(pikachu, sprite)), sprite);
    }
  }

  @Test
  void resultsAreUnavailableBeforeTheGameFinishes() {
    var context = context(1);
    var started = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    assertEquals(GamePhase.ROUND_ACTIVE, started.phase());
    var error = assertThrows(EngineException.class, () -> engine.getResults(started));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }
}
