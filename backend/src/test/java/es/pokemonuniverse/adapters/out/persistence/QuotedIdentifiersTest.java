package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

@MicronautTest
class QuotedIdentifiersTest {

  @Inject EntityManager entityManager;

  /**
   * Cuenta las notas de parche 0.1–0.5 que siembra V5 (las versiones posteriores no cuentan): la consulta solo funciona
   * si Hibernate cita las mayúsculas.
   */
  @Test
  void hibernateQueriesPascalCaseTableAndColumns() {
    var count =
        entityManager
            .createQuery(
                "select count(c) from ChangelogEntity c where c.published = true"
                    + " and c.version in ('0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0')",
                Long.class)
            .getSingleResult();
    assertEquals(5L, count);
  }
}
