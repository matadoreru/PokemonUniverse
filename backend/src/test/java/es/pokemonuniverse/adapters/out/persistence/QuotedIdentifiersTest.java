package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

@MicronautTest
class QuotedIdentifiersTest {

  @Inject EntityManager entityManager;

  /** Cuenta las notas de parche 0.x que siembra V5: la consulta solo funciona si Hibernate cita las mayúsculas. */
  @Test
  void hibernateQueriesPascalCaseTableAndColumns() {
    var count =
        entityManager
            .createQuery(
                "select count(c) from ChangelogEntity c where c.published = true and c.version like '0.%'",
                Long.class)
            .getSingleResult();
    assertEquals(5L, count);
  }
}
