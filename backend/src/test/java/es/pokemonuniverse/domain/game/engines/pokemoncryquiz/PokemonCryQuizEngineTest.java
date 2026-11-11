package es.pokemonuniverse.domain.game.engines.pokemoncryquiz;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizConfig.CryVersionMode;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.core.annotation.Nullable;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: sin catálogo de audio, errores de arranque y ramas inalcanzables. */
class PokemonCryQuizEngineTest {

  private final PokemonCryQuizEngine engine = new PokemonCryQuizEngine(GoldenManifests.of(PokemonCryQuizEngine.ID));

  /** Catálogo en memoria: {@code id → [latest, legacy]}. */
  private record Cries(Map<String, List<String>> entries) implements PokemonAudioCatalog {
    @Override public @Nullable String cryFor(String pokemonId, CryVersion version) {
      var entry = entries.get(pokemonId);
      return entry == null ? null : entry.get(version == CryVersion.LATEST ? 0 : 1);
    }

    @Override public List<String> pokemonIds(@Nullable CryVersion version) {
      return List.copyOf(entries.keySet());
    }
  }

  private static GameContext context(@Nullable PokemonAudioCatalog audio) {
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1))
        .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).roomCode("GOLD01").pokemonAudio(audio).build();
  }

  private static PokemonCryQuizConfig config(List<Integer> generations, CryVersionMode version) {
    return new PokemonCryQuizConfig(generations, 20, 3, version, false, true, false);
  }

  private static final Cries PIKACHU = new Cries(Map.of("pikachu", List.of("latest/25.ogg", "legacy/25.ogg")));

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-cry-quiz", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonCryQuizEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    assertEquals("pikachu", engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}", "{\"type\":\"VOTE\",\"pokemonId\":\"pikachu\"}", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** {@code runner.ts} no captura los errores de createInitialState: sin audio no hay escenario dorado posible. */
  @Test
  void creationNeedsAnAudioCatalogWithCriesForTheSelection() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), CryVersionMode.LATEST), context(null)));
    assertEquals("El catálogo local de gritos no está disponible.", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), CryVersionMode.LATEST), context(new Cries(Map.of()))));
    assertEquals("PostgreSQL no contiene gritos. Ejecuta una sincronización completa de PokéAPI desde Administración y "
        + "vuelve a intentarlo.", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(2), CryVersionMode.LATEST), context(PIKACHU)));
    assertEquals("No hay gritos disponibles en PostgreSQL para las generaciones seleccionadas.", error.getMessage());
    // Una URL vacía es falsy: no entra en el pool.
    var emptyLatest = new Cries(Map.of("pikachu", List.of("", "legacy/25.ogg")));
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), CryVersionMode.LATEST), context(emptyLatest)));
    assertEquals("No hay gritos disponibles en PostgreSQL para las generaciones seleccionadas.", error.getMessage());
  }

  /** {@code start} no comprueba la fase: volver a llamarlo abre otra ronda. */
  @Test
  void startHasNoPhaseGuard() {
    var context = context(PIKACHU);
    var started = engine.start(engine.createInitialState(config(List.of(1), CryVersionMode.LEGACY), context), context);
    assertEquals(2, engine.start(started, context).roundNumber());
  }

  /** Estados que el flujo público no produce: el pool, el objetivo o el catálogo desaparecen. */
  @Test
  void missingCriesUseTheServerLiterals() {
    var context = context(PIKACHU);
    var initial = engine.createInitialState(config(List.of(1), CryVersionMode.LATEST), context);
    var emptyPool = initial.toBuilder().poolIds(List.of("missingno")).build();
    var error = assertThrows(EngineException.class, () -> engine.start(emptyPool, context));
    assertEquals("No hay gritos disponibles para esta configuración.", error.getMessage());
    var started = engine.start(initial, context);
    var lost = started.toBuilder().targetPokemonId("missingno").build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(lost, context.withNow(21_000)));
    assertEquals("El grito objetivo ya no está disponible.", error.getMessage());
    var noVersion = started.toBuilder().currentCryVersion(null).build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(noVersion, context.withNow(21_000)));
    assertEquals("El grito objetivo ya no está disponible.", error.getMessage());
    var request = new AssetRequest(started.assetToken(), 1, "cry");
    assertEquals(Optional.of(AssetResolution.original("latest/25.ogg")), engine.resolveAsset(started, request, context));
    assertTrue(engine.resolveAsset(started, request, context(null)).isEmpty());
    assertTrue(engine.resolveAsset(noVersion, request, context).isEmpty());
  }

  @Test
  void usesTheOpaqueRoomWithoutRoomCode() {
    var context = context(PIKACHU).toBuilder().roomCode(null).build();
    var started = engine.start(engine.createInitialState(config(List.of(1), CryVersionMode.RANDOM), context), context);
    assertEquals("/api/rooms/opaque/games/" + started.assetToken() + "/rounds/1/options/cry/audio",
        engine.getPublicState(started, context).cryUrl());
  }

  /**
   * {@code publicAttempts=false}: el servidor no manda los fallos de nadie en la vista pública y cada jugador recibe
   * solo los suyos en su vista; con {@code true} todo sigue como antes (sin {@code attempts} en la vista propia).
   */
  @Test
  void hiddenPublicAttemptsOnlyReachTheirOwnPlayer() {
    var cries = new Cries(Map.of("pikachu", List.of("latest/25.ogg", "legacy/25.ogg"),
        "bulbasaur", List.of("latest/1.ogg", "legacy/1.ogg")));
    var context = context(cries).toBuilder()
        .players(List.of(new GamePlayer("p1", "Ana"), new GamePlayer("p2", "Bruno"))).build();
    for (boolean visible : List.of(true, false)) {
      var config = new PokemonCryQuizConfig(List.of(1), 20, 3, CryVersionMode.LATEST, false, visible, false);
      var started = engine.start(engine.createInitialState(config, context), context);
      var wrong = "pikachu".equals(started.targetPokemonId()) ? "bulbasaur" : "pikachu";
      var state = engine.handleAction(started, "p2", new PokemonCryQuizTypes.PokemonCryQuizAction(wrong),
          context.withNow(2_000)).state();
      var publicState = engine.getPublicState(state, context);
      var own = engine.getPlayerState(state, "p2", context);
      var other = engine.getPlayerState(state, "p1", context);
      if (visible) {
        assertEquals(List.of("p2"), publicState.attempts().stream().map(a -> a.playerId()).toList());
        assertEquals(null, own.attempts());
        assertEquals(null, other.attempts());
      } else {
        assertEquals(List.of(), publicState.attempts());
        assertEquals(List.of(wrong), own.attempts().stream().map(a -> a.guessedPokemon().id()).toList());
        assertEquals(List.of(), other.attempts());
        // La revelación sigue contando los intentos de cada uno.
        assertEquals(1, own.attemptCount());
      }
    }
  }
}
