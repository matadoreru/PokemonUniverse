package es.pokemonuniverse.domain.game.engines.whosthatpokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.json.JsonTree;
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

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque y ramas inalcanzables. */
class WhosThatPokemonEngineTest {

  private final WhosThatPokemonEngine engine = new WhosThatPokemonEngine(GoldenManifests.of(WhosThatPokemonEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000)
        .roomCode("GOLD01").build();
  }

  private static WhosThatPokemonConfig config(List<Integer> generations) {
    return new WhosThatPokemonConfig(generations, 20, 3, false, false, true);
  }

  private static Pokemon withSprite(Pokemon pokemon, String sprite) {
    return new Pokemon(pokemon.id(), pokemon.nationalDexNumber(), pokemon.name(), pokemon.generation(),
        pokemon.isDefault(), sprite, pokemon.shinySprite(), pokemon.palette(), pokemon.paletteWeights(), pokemon.hp(),
        pokemon.attack(), pokemon.defense(), pokemon.specialAttack(), pokemon.specialDefense(), pokemon.speed(),
        pokemon.baseStatTotal(), pokemon.heightDecimeters(), pokemon.weightHectograms(), pokemon.evolutionStage(),
        pokemon.evolutionStageCount(), pokemon.legendaryStatus(), pokemon.color(), pokemon.abilities(),
        pokemon.names(), pokemon.types());
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
