package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.context.annotation.Context;
import io.micronaut.context.env.Environment;
import io.micronaut.context.exceptions.ConfigurationException;
import jakarta.annotation.PostConstruct;

/** Falla en el arranque si JDBC_URL no es una URL JDBC de PostgreSQL, en vez de esperar al timeout de Hikari. */
@Context
public class JdbcUrlCheck {

  private static final String PREFIX = "jdbc:postgresql://";

  private final Environment environment;

  JdbcUrlCheck(Environment environment) {
    this.environment = environment;
  }

  @PostConstruct
  void check() {
    var url = environment.getProperty("datasources.default.url", String.class).orElse("");
    if (!url.startsWith(PREFIX)) {
      var colon = url.indexOf(':');
      var shown = colon >= 0 ? url.substring(0, colon) : "";
      throw new ConfigurationException(
          "JDBC_URL debe empezar por " + PREFIX + " (recibido: " + shown + ")");
    }
  }
}
