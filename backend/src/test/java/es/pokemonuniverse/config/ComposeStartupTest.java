package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.datasync.pokemon.PokeApiFixtureServer;
import es.pokemonuniverse.application.datasync.tcg.TcgDexFixtureServer;
import io.micronaut.context.ApplicationContext;
import io.micronaut.context.env.PropertySource;
import io.micronaut.runtime.server.EmbeddedServer;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.yaml.snakeyaml.Yaml;

/**
 * Arranque con la configuración de producción: el entorno del servicio {@code backend} de {@code compose.yaml} (sus
 * valores por defecto, como en un {@code .env} sin esas variables) sobre una BD propia, vacía, con PokéAPI y TCGdex
 * grabados. Entorno {@code prod} como en compose ({@code MICRONAUT_ENVIRONMENTS}), así que el esquema lo crea
 * {@code FlywayMigrations} y el orden de arranque es el de producción: Flyway, salas interrumpidas, data-sync, servidor.
 */
class ComposeStartupTest {

  private static final Path COMPOSE = Path.of("..", "compose.yaml");
  private static final Path DOCKERFILE = Path.of("Dockerfile");
  private static final Pattern VARIABLE = Pattern.compile("\\$\\{([A-Z0-9_]+)(?::([-?])([^}]*))?}");
  private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  private static final HttpClient HTTP = HttpClient.newHttpClient();

  private static PokeApiFixtureServer pokeapi;
  private static TcgDexFixtureServer tcgdex;

  @BeforeAll
  static void start() throws Exception {
    POSTGRES.start();
    pokeapi = new PokeApiFixtureServer();
    tcgdex = new TcgDexFixtureServer();
  }

  @AfterAll
  static void stop() {
    pokeapi.close();
    tcgdex.close();
    POSTGRES.stop();
  }

  @Test
  void composeEnablesRoomsStaleRoomCleanupAndDataSyncAndShipsTheArtworks() throws Exception {
    var env = composeEnvironment();
    assertEquals("true", env.get("ROOMS_ENABLED"));
    assertEquals("true", env.get("INTERRUPT_STALE_ROOMS"));
    assertEquals("true", env.get("BACKEND_DATA_SYNC_ENABLED"));
    assertEquals("6", env.get("DATA_SYNC_HOUR"));
    assertEquals("0", env.get("DATA_SYNC_MINUTE"));
    assertEquals("Europe/Madrid", env.get("DATA_SYNC_TIMEZONE"));
    // El directorio de artworks de compose es el que la imagen copia desde backend/assets/pokemon-artworks.
    var copy = Pattern.compile("(?m)^COPY\\s+assets/pokemon-artworks\\s+(\\S+)\\s*$").matcher(Files.readString(DOCKERFILE));
    assertTrue(copy.find(), "El Dockerfile no copia assets/pokemon-artworks");
    assertEquals(copy.group(1).replaceAll("/$", ""), env.get("POKEMON_ARTWORK_DIR"));
    assertTrue(Files.isDirectory(Path.of("assets", "pokemon-artworks")));
  }

  /**
   * BD vacía: {@code ensureInitialPokemon} termina antes de que el servidor acepte conexiones; con el servidor ya
   * listo, la inicial de TCG sigue en curso (TCGdex retenido) y {@code /api/pokemon} devuelve el catálogo. Después,
   * un segundo arranque sobre la misma BD marca INTERRUPTED las salas y partidas que dejó abiertas el anterior.
   */
  @Test
  void emptyDatabaseSyncsPokemonBeforeServingAndARestartInterruptsStaleRooms() throws Exception {
    var db = createDatabase("compose_startup");
    var gate = new CountDownLatch(1);
    tcgdex.hold(gate);
    try (var context = boot(db)) {
      // Se abre antes de cerrar el contexto, también si algo falla: stop() espera a la inicial de TCG retenida.
      try {
        var probe = context.getBean(StartupProbe.class).snapshot();
        assertNotNull(probe, "No se registró el arranque del servidor");
        // 3 especies y la forma geodude-alola de la PokéAPI grabada.
        assertEquals(4, probe.pokemon(), "Pokémon en la BD al aceptar conexiones");
        assertEquals(1, probe.pokeapiCompleted());
        assertEquals(0, probe.pokeapiRunning());

        var base = "http://127.0.0.1:" + context.getBean(EmbeddedServer.class).getPort();
        assertEquals(200, get(base + "/health/readiness").statusCode());
        var pokemon = get(base + "/api/pokemon");
        assertEquals(200, pokemon.statusCode());
        for (var name : List.of("geodude", "graveler", "golem")) {
          assertTrue(pokemon.body().contains("\"" + name + "\""), name + " en " + pokemon.body());
        }
        assertEquals(List.of("RUNNING"), statuses(db, "TCGDEX"));
      } finally {
        gate.countDown();
      }
      awaitStatus(db, "TCGDEX", "COMPLETED");
    }

    var room = "room-" + System.nanoTime();
    execute(db, "INSERT INTO \"RoomHistory\" (\"id\", \"roomCode\", \"hostDisplayName\", \"maxPlayers\", \"status\","
        + " \"createdAt\", \"updatedAt\") VALUES (?, 'STALE1', 'Host', 8, 'ACTIVE', ?, ?)", room, now(), now());
    execute(db, "INSERT INTO \"GameHistory\" (\"id\", \"roomCode\", \"gameId\", \"playerCount\", \"config\","
        + " \"startedAt\", \"resultId\", \"roomHistoryId\", \"status\") VALUES ('game-1', 'STALE1', 'type-chain', 2,"
        + " '{}'::jsonb, ?, 'result-1', ?, 'IN_PROGRESS')", now(), room);

    try (var context = boot(db)) {
      assertEquals("INTERRUPTED|SERVER_STOPPED|true",
          single(db, "SELECT \"status\"::text || '|' || \"closeReason\" || '|' || (\"endedAt\" IS NOT NULL)"
              + " FROM \"RoomHistory\" WHERE \"id\" = '" + room + "'"));
      assertEquals("INTERRUPTED|true", single(db, "SELECT \"status\"::text || '|' || (\"endedAt\" IS NOT NULL)"
          + " FROM \"GameHistory\" WHERE \"id\" = 'game-1'"));
    }
  }

  /** El {@code environment} del servicio {@code backend}, con los valores por defecto de cada {@code ${PU_…}}. */
  @SuppressWarnings("unchecked")
  static Map<String, String> composeEnvironment() throws Exception {
    Map<String, Object> compose = new Yaml().load(Files.readString(COMPOSE));
    var services = (Map<String, Object>) compose.get("services");
    var backend = (Map<String, Object>) services.get("backend");
    var raw = (Map<String, Object>) backend.get("environment");
    var env = new HashMap<String, String>();
    raw.forEach((name, value) -> env.put(name, expand(String.valueOf(value))));
    return env;
  }

  /** {@code ${X:-por defecto}} → el valor por defecto; {@code ${X:?mensaje}} (obligatoria) → un valor de prueba. */
  private static String expand(String value) {
    var matcher = VARIABLE.matcher(value);
    var out = new StringBuilder();
    while (matcher.find()) {
      var replacement = "-".equals(matcher.group(2)) ? matcher.group(3)
          : matcher.group(1).equals("PU_JWT_SECRET") ? "compose-secret-compose-secret-compose-secret" : "required";
      matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
    }
    matcher.appendTail(out);
    return out.toString();
  }

  private static ApplicationContext boot(String db) throws Exception {
    var env = new HashMap<>(composeEnvironment());
    var environments = env.remove("MICRONAUT_ENVIRONMENTS");
    // Lo que en compose apunta a otros contenedores o a rutas de la imagen.
    env.put("PORT", "-1");
    env.put("JDBC_URL", POSTGRES.getJdbcUrl().replace("/" + POSTGRES.getDatabaseName(), "/" + db));
    env.put("DB_USER", POSTGRES.getUsername());
    env.put("DB_PASSWORD", POSTGRES.getPassword());
    env.put("POKEMON_ARTWORK_DIR", Path.of("assets", "pokemon-artworks").toString());
    env.put("AVATAR_STORAGE_DIR", Files.createTempDirectory("compose-avatars").toString());
    env.put("POKEAPI_BASE_URL", pokeapi.urls().base());
    env.put("POKEAPI_SPRITE_BASE_URL", pokeapi.spriteBase());
    env.put("TCGDEX_BASE_URL", tcgdex.urls().base());
    var context = ApplicationContext.builder()
        .deduceEnvironment(false)
        .environments(environments)
        .propertySources(PropertySource.of("compose", Map.copyOf(env),
            PropertySource.PropertyConvention.ENVIRONMENT_VARIABLE, PropertySource.Origin.of("compose.yaml")))
        .properties(Map.of("pu.test.fixture-seeder-limits", "true", "pu.test.startup-probe", "true",
            "test-resources.enabled", "false"))
        .start();
    try {
      assertTrue(context.getProperty("pu.rooms.enabled", Boolean.class).orElse(false));
      assertTrue(context.getProperty("pu.interrupt-stale-rooms", Boolean.class).orElse(false));
      assertTrue(context.getProperty("pu.data-sync.enabled", Boolean.class).orElse(false));
      context.getBean(EmbeddedServer.class).start();
      return context;
    } catch (RuntimeException | Error e) {
      context.close();
      throw e;
    }
  }

  private static HttpResponse<String> get(String url) throws Exception {
    return HTTP.send(HttpRequest.newBuilder(URI.create(url)).build(), HttpResponse.BodyHandlers.ofString());
  }

  private static List<String> statuses(String db, String source) throws SQLException {
    try (var connection = dataSource(db).getConnection();
        var statement = connection.prepareStatement(
            "SELECT \"status\"::text FROM \"DataSyncRun\" WHERE \"source\"::text = ? ORDER BY \"createdAt\"")) {
      statement.setString(1, source);
      try (var set = statement.executeQuery()) {
        var all = new ArrayList<String>();
        while (set.next()) all.add(set.getString(1));
        return all;
      }
    }
  }

  private static void awaitStatus(String db, String source, String status) throws Exception {
    var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
    while (!statuses(db, source).equals(List.of(status))) {
      if (System.nanoTime() > deadline) throw new AssertionError(source + ": " + statuses(db, source));
      Thread.sleep(50);
    }
  }

  private static String single(String db, String sql) throws SQLException {
    try (var connection = dataSource(db).getConnection(); var statement = connection.createStatement();
        var set = statement.executeQuery(sql)) {
      assertTrue(set.next(), sql);
      return set.getString(1);
    }
  }

  private static Timestamp now() {
    return Timestamp.from(Instant.now());
  }

  private static void execute(String db, String sql, Object... params) throws SQLException {
    try (var connection = dataSource(db).getConnection(); var statement = connection.prepareStatement(sql)) {
      for (int i = 0; i < params.length; i++) statement.setObject(i + 1, params[i]);
      statement.executeUpdate();
    }
  }

  private static String createDatabase(String name) throws SQLException {
    execute(POSTGRES.getDatabaseName(), "CREATE DATABASE " + name);
    return name;
  }

  private static DataSource dataSource(String db) {
    var ds = new PGSimpleDataSource();
    ds.setServerNames(new String[] {POSTGRES.getHost()});
    ds.setPortNumbers(new int[] {POSTGRES.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)});
    ds.setDatabaseName(db);
    ds.setUser(POSTGRES.getUsername());
    ds.setPassword(POSTGRES.getPassword());
    return ds;
  }
}
