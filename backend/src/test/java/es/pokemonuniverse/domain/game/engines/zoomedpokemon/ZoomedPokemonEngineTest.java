package es.pokemonuniverse.domain.game.engines.zoomedpokemon;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonConfig.HintKind;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonConfig.ImageMode;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.support.EngineTestKit;
import io.micronaut.core.annotation.Nullable;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: errores de arranque, ramas inalcanzables y el respaldo sin sala. */
class ZoomedPokemonEngineTest {

  private final ZoomedPokemonEngine engine = new ZoomedPokemonEngine(GoldenManifests.of(ZoomedPokemonEngine.ID));

  /** Artwork en memoria para {@code ids}. */
  private record Artworks(Map<String, String> locations) implements PokemonVisualCatalog {
    @Override public @Nullable Asset artworkFor(String pokemonId) {
      var location = locations.get(pokemonId);
      return location == null ? null : new Asset(pokemonId, Source.ARTWORK, location, null, null, null);
    }

    @Override public List<String> artworkPokemonIds() {
      return List.copyOf(locations.keySet());
    }
  }

  private static final Artworks PIKACHU = new Artworks(Map.of("pikachu", "art/25.png"));

  private static GameContext context(int players, @Nullable PokemonVisualCatalog visuals) {
    return EngineTestKit.builder(players).roomCode("GOLD01").pokemonVisuals(visuals).build();
  }

  private static ZoomedPokemonConfig config(List<Integer> generations, ImageMode mode) {
    return new ZoomedPokemonConfig(generations, mode, 20, 3, false, List.of(HintKind.GENERATION), false, true);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("zoomed-pokemon", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new ZoomedPokemonEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    assertEquals("pikachu", engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}", "{\"type\":\"GUESS_POKEMON\"}", "[]")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** {@code runner.ts} no captura los errores de createInitialState/start: estos literales solo se prueban aquí. */
  @Test
  void creationErrorsUseTheServerLiterals() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), ImageMode.MIXED), context(0, null)));
    assertEquals("Se necesitan al menos 1 jugadores.", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), ImageMode.ARTWORK), context(1, null)));
    assertEquals("No hay artworks disponibles para las generaciones seleccionadas.", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(9), ImageMode.MIXED), context(1, PIKACHU)));
    assertEquals("No hay imágenes válidas para las generaciones seleccionadas.", error.getMessage());
    var context = context(1, PIKACHU);
    var started = engine.start(engine.createInitialState(config(List.of(1), ImageMode.ARTWORK), context), context);
    error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
  }

  @Test
  void preloadsTheChosenVisualLocation() {
    var preloaded = new ArrayList<String>();
    var context = context(1, PIKACHU).toBuilder().preloadImage(preloaded::add).build();
    engine.start(engine.createInitialState(config(List.of(1), ImageMode.ARTWORK), context), context);
    assertEquals(List.of("art/25.png"), preloaded);
  }

  /** Estados que el flujo público no produce: el pool, el artwork o el objetivo desaparecen. */
  @Test
  void missingImagesUseTheServerLiterals() {
    var context = context(1, PIKACHU);
    var artwork = engine.createInitialState(config(List.of(1), ImageMode.ARTWORK), context);
    var error = assertThrows(EngineException.class,
        () -> engine.start(artwork.toBuilder().poolIds(List.of("missingno")).build(), context));
    assertEquals("No hay artworks disponibles para las generaciones seleccionadas.", error.getMessage());
    var mixed = engine.createInitialState(config(List.of(1), ImageMode.MIXED), context);
    error = assertThrows(EngineException.class,
        () -> engine.start(mixed.toBuilder().poolIds(List.of("missingno")).build(), context));
    assertEquals("No hay imágenes válidas para las generaciones seleccionadas.", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.start(artwork.toBuilder().poolIds(List.of("bulbasaur")).build(), context));
    assertEquals("El Pokémon seleccionado no dispone de una imagen válida.", error.getMessage());
    var started = engine.start(artwork, context);
    var lost = started.toBuilder().targetPokemonId("missingno").build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(lost, context.withNow(21_000)));
    assertEquals("El objetivo visual ya no está disponible.", error.getMessage());
    var noVisual = started.toBuilder().visual(null).build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(noVisual, context.withNow(21_000)));
    assertEquals("El objetivo visual ya no está disponible.", error.getMessage());
    var request = new AssetRequest(started.assetToken(), 1, "stage-0");
    assertTrue(engine.resolveAsset(noVisual, request, context).isEmpty());
    assertEquals(null, engine.getPublicState(noVisual, context).imageUrl());
  }

  /** {@code /^stage-([0-3])$/}: el {@code $} de JS no admite un salto de línea final. */
  @Test
  void stageAssetIdsMatchTheWholeString() {
    var context = context(1, PIKACHU);
    var started = engine.start(engine.createInitialState(config(List.of(1), ImageMode.ARTWORK), context), context);
    var token = started.assetToken();
    var crop = engine.resolveAsset(started, new AssetRequest(token, 1, "stage-0"), context).orElseThrow();
    assertEquals("art/25.png", crop.source());
    assertEquals(5.0, crop.zoom());
    for (var id : List.of("stage-0\n", "xstage-0", "stage-00", "stage-")) {
      assertTrue(engine.resolveAsset(started, new AssetRequest(token, 1, id), context).isEmpty(), id);
    }
  }

  @Test
  void usesTheOpaqueRoomWithoutRoomCode() {
    var context = context(1, PIKACHU).toBuilder().roomCode(null).build();
    var started = engine.start(engine.createInitialState(config(List.of(1), ImageMode.ARTWORK), context), context);
    assertEquals("/api/rooms/opaque/games/" + started.assetToken() + "/rounds/1/options/stage-0/sprite",
        engine.getPublicState(started, context).imageUrl());
  }

  @Test
  void rejectsStagesOutsideTheBonusTable() {
    for (int stage : new int[] {-1, 4}) {
      var error = assertThrows(EngineException.class, () -> ZoomedPokemonRules.zoomBonusForStage(stage));
      assertEquals("Invalid zoom stage", error.getMessage());
    }
    assertEquals(List.of(6_000L, 11_000L, 16_000L), ZoomedPokemonRules.zoomStageSchedule(1_000, 20));
  }
}
