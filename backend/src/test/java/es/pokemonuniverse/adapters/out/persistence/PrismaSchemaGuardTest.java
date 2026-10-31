package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micronaut.context.ApplicationContext;
import io.micronaut.context.exceptions.ConfigurationException;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

/**
 * El guard no existe en el entorno test ({@code @Requires(notEnv = "test")}), así que se construye a mano contra la
 * BD de Testcontainers, que Flyway crea desde cero y por tanto no tiene {@code _prisma_migrations}.
 */
@MicronautTest(transactional = false)
class PrismaSchemaGuardTest {

  @Inject DataSource dataSource;
  @Inject ApplicationContext context;
  @Inject DataSourceResolver resolver;

  @Test
  void isNotABeanInTheTestEnvironment() {
    assertFalse(context.containsBean(PrismaSchemaGuard.class));
  }

  @Test
  void failsWithoutPrismaMigrations() {
    var guard = new PrismaSchemaGuard(dataSource, resolver);
    var ex = assertThrows(ConfigurationException.class, guard::migrate);
    assertEquals(PrismaSchemaGuard.MISSING_PRISMA, ex.getMessage());
  }

  @Test
  void migratesWhenPrismaMigrationsExist() throws SQLException {
    execute("create table if not exists \"_prisma_migrations\" (id varchar(36) primary key)");
    try {
      assertDoesNotThrow(new PrismaSchemaGuard(dataSource, resolver)::migrate);
    } finally {
      execute("drop table if exists \"_prisma_migrations\"");
    }
  }

  private void execute(String sql) throws SQLException {
    try (var c = resolver.resolve(dataSource).getConnection(); var st = c.createStatement()) {
      st.execute(sql);
    }
  }
}
