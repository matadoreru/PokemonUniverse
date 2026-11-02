package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.context.ApplicationContext;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PuConfigTest {

  private static Map<String, Object> props(String secret, boolean rateLimitDisabled) {
    return Map.of(
        "pu.auth.secret", secret,
        "pu.web-origin", "http://x",
        "pu.avatar-storage-dir", "/tmp/a",
        "pu.rate-limit-disabled", rateLimitDisabled,
        "JDBC_URL", "jdbc:postgresql://localhost:1/unused",
        "DB_USER", "u",
        "DB_PASSWORD", "p",
        "datasources.default.enabled", false,
        "flyway.datasources.default.enabled", false);
  }

  private static String chain(Throwable t) {
    var sb = new StringBuilder();
    for (; t != null; t = t.getCause()) {
      sb.append(t.getMessage()).append('\n');
    }
    return sb.toString();
  }

  @Test
  void rejectsShortSecret() {
    var ex =
        assertThrows(
            Exception.class, () -> ApplicationContext.run(props("corto", false), "test"));
    assertTrue(chain(ex).contains("pu.auth.secret"), chain(ex));
  }

  @Test
  void roomSettingsDefaultToNodeValuesAndAreBounded() {
    String secret = "x".repeat(40);
    try (var ctx = ApplicationContext.run(props(secret, false), "test")) {
      var cfg = ctx.getBean(PuConfig.class);
      org.junit.jupiter.api.Assertions.assertEquals(8, cfg.roomMaxPlayers());
      org.junit.jupiter.api.Assertions.assertEquals(30_000, cfg.reconnectGraceMs());
    }
    var tooShort = new java.util.HashMap<String, Object>(props(secret, false));
    tooShort.put("pu.reconnect-grace-ms", 4_999);
    var ex = assertThrows(Exception.class, () -> ApplicationContext.run(tooShort, "test").getBean(PuConfig.class));
    assertTrue(chain(ex).contains("reconnectGraceMs"), chain(ex));
    var tooMany = new java.util.HashMap<String, Object>(props(secret, false));
    tooMany.put("pu.room-max-players", 101);
    var ex2 = assertThrows(Exception.class, () -> ApplicationContext.run(tooMany, "test").getBean(PuConfig.class));
    assertTrue(chain(ex2).contains("roomMaxPlayers"), chain(ex2));
  }

  @Test
  void rateLimitDisabledIsIgnoredInProd() {
    String secret = "x".repeat(40);
    try (var ctx = ApplicationContext.run(props(secret, true), "prod")) {
      var cfg = ctx.getBean(PuConfig.class);
      assertTrue(cfg.rateLimitActive(ctx.getEnvironment()));
    }
    try (var ctx = ApplicationContext.run(props(secret, true), "test")) {
      var cfg = ctx.getBean(PuConfig.class);
      assertFalse(cfg.rateLimitActive(ctx.getEnvironment()));
    }
  }

  /** {@code DATA_SYNC_*}: apagado por defecto (un solo dueño de los efectos compartidos) y horario de Node. */
  @Test
  void dataSyncIsDisabledByDefaultWithTheNodeSchedule() {
    String secret = "x".repeat(40);
    try (var ctx = ApplicationContext.run(props(secret, false), "test")) {
      var cfg = ctx.getBean(PuConfig.DataSync.class);
      assertFalse(cfg.enabled());
      org.junit.jupiter.api.Assertions.assertEquals(6, cfg.hour());
      org.junit.jupiter.api.Assertions.assertEquals(0, cfg.minute());
      org.junit.jupiter.api.Assertions.assertEquals(java.time.ZoneId.of("Europe/Madrid"), cfg.zone());
    }
  }

  @Test
  void dataSyncScheduleIsBounded() {
    String secret = "x".repeat(40);
    for (var entry : Map.<String, Object>of("pu.data-sync.hour", 24, "pu.data-sync.minute", 60,
        "pu.data-sync.time-zone", "Marte/Olympus").entrySet()) {
      var invalid = new java.util.HashMap<String, Object>(props(secret, false));
      invalid.put(entry.getKey(), entry.getValue());
      var ex = assertThrows(Exception.class,
          () -> ApplicationContext.run(invalid, "test").getBean(PuConfig.DataSync.class));
      assertTrue(chain(ex).contains(entry.getKey().substring("pu.data-sync.".length()).replace("-z", "Z")), chain(ex));
    }
  }

  /** PokéAPI y sprites solo por https; http únicamente hacia loopback (servidor de fixtures de las pruebas). */
  @Test
  void dataSyncSourcesMustBeHttpsOrLoopback() {
    String secret = "x".repeat(40);
    for (var entry : Map.<String, Object>of("pu.data-sync.pokeapi-base-url", "http://pokeapi.co/api/v2",
        "pu.data-sync.sprite-base-url", "ftp://raw.githubusercontent.com").entrySet()) {
      var invalid = new java.util.HashMap<String, Object>(props(secret, false));
      invalid.put(entry.getKey(), entry.getValue());
      var ex = assertThrows(Exception.class,
          () -> ApplicationContext.run(invalid, "test").getBean(PuConfig.DataSync.class));
      assertTrue(chain(ex).contains("must be an https URL"), chain(ex));
    }
    var loopback = new java.util.HashMap<String, Object>(props(secret, false));
    loopback.put("pu.data-sync.pokeapi-base-url", "http://127.0.0.1:8099/api/v2");
    loopback.put("pu.data-sync.sprite-base-url", "http://localhost:8099/raw");
    try (var ctx = ApplicationContext.run(loopback, "test")) {
      assertTrue(ctx.getBean(PuConfig.DataSync.class).pokeapiBaseUrl().startsWith("http://127.0.0.1"));
    }
  }

  /**
   * Java no comparte el interruptor de Node: {@code DATA_SYNC_ENABLED=true} (el {@code .env} de Node) no enciende el
   * data-sync Java; solo {@code BACKEND_DATA_SYNC_ENABLED}.
   */
  @Test
  void onlyTheBackendSwitchEnablesTheJavaDataSync() {
    String secret = "x".repeat(40);
    var nodeSwitch = new java.util.HashMap<String, Object>(props(secret, false));
    nodeSwitch.put("DATA_SYNC_ENABLED", "true");
    try (var ctx = ApplicationContext.run(nodeSwitch, "test")) {
      assertFalse(ctx.getBean(PuConfig.DataSync.class).enabled());
    }
    var javaSwitch = new java.util.HashMap<String, Object>(props(secret, false));
    javaSwitch.put("BACKEND_DATA_SYNC_ENABLED", "true");
    try (var ctx = ApplicationContext.run(javaSwitch, "test")) {
      assertTrue(ctx.getBean(PuConfig.DataSync.class).enabled());
    }
  }
}
