package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.http.SyncHttpClient;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.PokemonPaletteCount;
import es.pokemonuniverse.application.datasync.pokemon.CatalogTables;
import es.pokemonuniverse.application.datasync.pokemon.PokeApiFixtureServer;
import es.pokemonuniverse.application.datasync.pokemon.PokeApiUrls;
import es.pokemonuniverse.application.datasync.pokemon.PokemonCatalogSeeder;
import es.pokemonuniverse.application.datasync.pokemon.PokemonCatalogStore;
import es.pokemonuniverse.application.datasync.pokemon.PokemonDataSync;
import es.pokemonuniverse.application.datasync.pokemon.PokemonPaletteSync;
import es.pokemonuniverse.application.datasync.pokemon.SeederLimits;
import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessEngine;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessState;
import es.pokemonuniverse.domain.room.LiveRoom;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.test.support.TestPropertyProvider;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Recarga del catálogo tras una sincronización POKEAPI completada ({@code index.ts}: {@code onCompleted} → catálogo y
 * audio, visuales, {@code rooms.replaceCatalog} y {@code registerPokemonRepository}). El adaptador real de PokéAPI
 * corre contra la PokéAPI grabada (sin red) con los límites de la fixture; el oyente es el que registra
 * {@code DataSyncBeans} al construir el servicio.
 */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "PokemonCatalogReloadTest")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PokemonCatalogReloadTest implements TestPropertyProvider {

  private static final String SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/74.png";
  private static final SeederLimits LIMITS = new SeederLimits(74, 76, 1, 1, 1, 1,
      SeederLimits.PRODUCTION.generationEnds());
  private static final String UNAVAILABLE = "No hay suficientes paletas en PostgreSQL para las"
      + " generaciones y tamaño seleccionados. Ejecuta la sincronización Pokémon.";

  /** El adaptador real de PokéAPI con los límites de la fixture (74-76) en lugar de los 1 025 de producción. */
  @Factory
  @Requires(property = "spec.name", value = "PokemonCatalogReloadTest")
  static class FixtureLimits {
    @Singleton
    @Replaces(PokemonDataSync.class)
    PokemonDataSync pokemonDataSync(PokemonCatalogStore store, PokemonCatalogSeeder seeder,
        PokemonPaletteSync palettes, SyncHttpClient http, Clock clock, PuConfig.DataSync config) {
      return new PokemonDataSync(store, seeder, palettes, http, new PokeApiUrls(config.pokeapiBaseUrl()), LIMITS,
          clock);
    }
  }

  private final PokeApiFixtureServer server;

  @Inject RoomCoordinator rooms;
  @Inject DataSyncService service;
  @Inject PokemonCatalogService catalogs;
  @Inject PokemonPaletteCount palettes;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject @Client("/") HttpClient client;

  PokemonCatalogReloadTest() {
    try {
      server = new PokeApiFixtureServer();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @Override
  public Map<String, String> getProperties() {
    return Map.of("pu.data-sync.pokeapi-base-url", server.urls().base(),
        "pu.data-sync.sprite-base-url", server.spriteBase());
  }

  @AfterAll
  void stopServer() {
    server.close();
  }

  /** BD vacía y salas con el catálogo vacío como punto de partida (otras pruebas comparten la BD). */
  @BeforeEach
  @AfterEach
  void clean() throws Exception {
    for (var room : rooms.store.list()) {
      for (var member : List.copyOf(room.members.keySet())) rooms.leave(member);
    }
    try (var connection = resolver.resolve(dataSource).getConnection(); var statement = connection.createStatement()) {
      CatalogTables.clear(connection);
      statement.executeUpdate("DELETE FROM \"DataSyncRun\"");
      statement.executeUpdate("DELETE FROM \"DataSyncState\"");
    }
    catalogs.refresh();
    rooms.replaceCatalog(catalogs.loadPokemonCatalog());
  }

  private void insertDefault(String id, int dex, String sprite) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement("INSERT INTO \"Pokemon\" (\"id\", \"nationalDexNumber\", \"name\","
            + " \"generation\", \"isDefault\", \"sprite\", \"abilities\", \"types\", \"metadata\", \"updatedAt\")"
            + " VALUES (?, ?, ?, 1, true, ?, '{}', '{}', '{}'::jsonb, ?)")) {
      statement.setString(1, id);
      statement.setInt(2, dex);
      statement.setString(3, id);
      statement.setString(4, sprite);
      statement.setTimestamp(5, Timestamp.from(Instant.now()));
      statement.executeUpdate();
    }
  }

  private LiveRoom lobby(String prefix) {
    var host = guest(prefix + "-host", "Host");
    var room = rooms.store.get(rooms.create(host, prefix + "-h", null).code());
    RoomTestKit.join(rooms, guest(prefix + "-guest", "Ana"), prefix + "-g", room.code);
    rooms.selectGame(host.id(), PokemonPaletteGuessEngine.ID);
    RoomTestKit.setReady(rooms, prefix + "-guest", true);
    return room;
  }

  private LiveRoom started(String prefix) {
    var room = lobby(prefix);
    rooms.startGame(prefix + "-host");
    assertNotNull(room.game);
    return room;
  }

  private static List<String> pool(LiveRoom room) {
    return ((PokemonPaletteGuessState) room.game.state).poolIds();
  }

  @SuppressWarnings("unchecked")
  private List<String> publicIds() {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/pokemon/selector"), Map.class);
    return ((List<Map<String, Object>>) body.get("pokemon")).stream().map(p -> (String) p.get("id")).toList();
  }

  private String selectorETag() {
    var etag = client.toBlocking().exchange(HttpRequest.GET("/api/pokemon/selector"), String.class).header("ETag");
    assertNotNull(etag);
    return etag;
  }

  @Test
  void aCompletedPokeApiSyncReloadsTheCatalogForNewGamesOnly() throws Exception {
    service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL).get();
    var running = started("reload-a");
    var snapshot = running.game.catalog;
    var version = rooms.view(running, "reload-a-host").gameCatalogVersion();
    var pool = pool(running);
    assertFalse(publicIds().contains("reload-newmon"));
    var etag = selectorETag();

    insertDefault("reload-newmon", 9_001, SPRITE + "?reload");
    service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL).get();

    assertTrue(publicIds().contains("reload-newmon"), "/api/pokemon/selector debe ver el Pokémon nuevo");
    assertNotEquals(etag, selectorETag(), "la recarga debe cambiar el ETag del buscador");
    // La partida en curso conserva su catálogo, su versión y su pool.
    assertSame(snapshot, running.game.catalog);
    assertEquals(version, rooms.view(running, "reload-a-host").gameCatalogVersion());
    assertEquals(pool, pool(running));
    assertFalse(pool.contains("reload-newmon"));
    // Una partida nueva arranca con el catálogo recargado y otra versión.
    var fresh = started("reload-b");
    assertNotEquals(version, rooms.view(fresh, "reload-b-host").gameCatalogVersion());
    assertTrue(pool(fresh).contains("reload-newmon"));
  }

  @Test
  void palettesWrittenByTheSyncMakePaletteGuessAvailableWithoutRestarting() throws Exception {
    for (int i = 1; i <= PokemonPaletteCount.MIN_PLAYABLE; i++) {
      insertDefault("reload-palette-" + i, 2_000 + i, SPRITE + "?n=" + i);
    }
    lobby("palette-before");
    var error = assertThrows(RoomException.class, () -> rooms.startGame("palette-before-host"));
    assertEquals(UNAVAILABLE, error.getMessage());

    service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL).get();

    assertTrue(palettes.persisted() >= PokemonPaletteCount.MIN_PLAYABLE, "el data-sync debe escribir las paletas");
    var room = started("palette-after");
    assertTrue(pool(room).size() >= PokemonPaletteCount.MIN_PLAYABLE);
  }
}
