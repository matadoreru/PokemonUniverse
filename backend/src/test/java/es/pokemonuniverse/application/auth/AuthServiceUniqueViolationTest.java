package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import io.micronaut.http.HttpStatus;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Prueba la traducción de una violación real de la restricción única de Postgres (carrera tras la comprobación previa). */
@MicronautTest
class AuthServiceUniqueViolationTest {

  @Inject AuthService service;
  @Inject UserRepository users;

  @Test
  void uniqueViolationOnInsertBecomes409() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var first = UserEntity.create(UUID.randomUUID().toString(), "dup_" + tag, tag + "@mail.com", "h", Instant.now());
    service.insert(first);
    var second = UserEntity.create(UUID.randomUUID().toString(), "dup2_" + tag, tag + "@mail.com", "h", Instant.now());
    var e = assertThrows(ApiException.class, () -> service.insert(second));
    assertEquals(HttpStatus.CONFLICT, e.status());
    assertEquals("Email or username already in use", e.getMessage());
  }
}
