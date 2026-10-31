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
}
