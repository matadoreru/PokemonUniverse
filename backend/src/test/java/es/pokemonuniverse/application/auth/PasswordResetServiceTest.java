package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.errors.InvalidResetLinkException;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.support.MutableClock;
import es.pokemonuniverse.support.RecordingMailSender;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.inject.Singleton;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "PasswordResetServiceTest")
@Property(name = "test.mail.recording", value = "true")
@Property(name = "test.clock.mutable", value = "true")
class PasswordResetServiceTest {

  /** Ejecutor que corre la tarea en el hilo que la encarga: el envío «en segundo plano» acaba antes de volver. */
  static final class SameThreadExecutor extends AbstractExecutorService {
    private volatile boolean shutdown;

    @Override
    public void execute(Runnable command) {
      command.run();
    }

    @Override
    public void shutdown() {
      shutdown = true;
    }

    @Override
    public List<Runnable> shutdownNow() {
      shutdown = true;
      return List.of();
    }

    @Override
    public boolean isShutdown() {
      return shutdown;
    }

    @Override
    public boolean isTerminated() {
      return shutdown;
    }

    @Override
    public boolean awaitTermination(long timeout, TimeUnit unit) {
      return true;
    }
  }

  @Factory
  @Requires(property = "spec.name", value = "PasswordResetServiceTest")
  static class SyncExecutorFactory {
    @Singleton
    @Named(TaskExecutors.BLOCKING)
    @Replaces(bean = ExecutorService.class, named = TaskExecutors.BLOCKING)
    ExecutorService blocking() {
      return new SameThreadExecutor();
    }
  }

  @Inject PasswordResetService service;
  @Inject AuthService auth;
  @Inject RecordingMailSender mail;
  @Inject MutableClock clock;
  @Inject Clock injectedClock;

  private record Account(AuthUser user, String username, String email) {}

  @BeforeEach
  void resetClock() {
    clock.set(Instant.now().truncatedTo(ChronoUnit.MILLIS));
  }

  private Account register() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var username = "rec_" + tag;
    var email = "rec_" + tag + "@mail.com";
    var user = auth.register(new RegisterCommand(username, email, "contrasena-vieja-1"));
    return new Account(user, username, email);
  }

  private String requestAndGetToken(String identifier, String email) {
    var before = mail.sentTo(email).size();
    service.requestReset(identifier);
    var sent = mail.sentTo(email);
    assertEquals(before + 1, sent.size(), "debe salir un correo nuevo a " + email);
    return RecordingMailSender.tokenOf(sent.getLast());
  }

  @Test
  void replacementsAreActive() {
    assertSame(clock, injectedClock);
    var account = register();
    service.requestReset(account.email());
    var sent = mail.sent().stream().filter(s -> s.message().to().equals(account.email())).toList();
    assertEquals(1, sent.size());
    assertSame(Thread.currentThread(), sent.getFirst().thread(), "el envío debe ser síncrono en el test");
  }

  @Test
  void requestSendsOneMailWithAWorkingToken() {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    assertEquals(1, mail.sentTo(account.email()).size());
    var identity = service.reset(token, "nueva-contrasena-1");
    assertEquals(account.user().id(), identity.id());
    assertEquals(AuthUser.Kind.USER, identity.kind());
  }

  @Test
  void requestByUsernameSendsToTheAccountEmail() {
    var account = register();
    var token = requestAndGetToken(account.username(), account.email());
    assertEquals(account.user().id(), service.reset(token, "nueva-contrasena-1").id());
  }

  @Test
  void unknownAccountSendsNothingAndDoesNotThrow() {
    var before = mail.sent().size();
    assertDoesNotThrow(() -> service.requestReset("nadie_" + UUID.randomUUID() + "@mail.com"));
    assertDoesNotThrow(() -> service.requestReset("nadie_" + UUID.randomUUID().toString().substring(0, 8)));
    assertEquals(before, mail.sent().size());
  }

  @Test
  void secondRequestWithinAMinuteSendsNothing() {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    clock.advance(Duration.ofSeconds(59));
    service.requestReset(account.email());
    assertEquals(1, mail.sentTo(account.email()).size());
    // El primer enlace sigue valiendo: la segunda petición no hizo nada.
    assertEquals(account.user().id(), service.reset(token, "nueva-contrasena-1").id());
  }

  @Test
  void secondRequestAfterAMinuteInvalidatesTheFirstLink() {
    var account = register();
    var first = requestAndGetToken(account.email(), account.email());
    clock.advance(Duration.ofSeconds(61));
    var second = requestAndGetToken(account.email(), account.email());
    assertThrows(InvalidResetLinkException.class, () -> service.reset(first, "nueva-contrasena-1"));
    assertEquals(account.user().id(), service.reset(second, "nueva-contrasena-1").id());
  }

  @Test
  void expiredAfterThirtyMinutes() {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    clock.advance(Duration.ofMinutes(30).plusSeconds(1));
    var e = assertThrows(InvalidResetLinkException.class, () -> service.reset(token, "nueva-contrasena-1"));
    assertEquals("Invalid or expired reset link", e.getMessage());
  }

  @Test
  void stillValidJustBeforeThirtyMinutes() {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    clock.advance(Duration.ofMinutes(30).minusSeconds(1));
    assertEquals(account.user().id(), service.reset(token, "nueva-contrasena-1").id());
  }

  @Test
  void tokenIsSingleUse() {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    service.reset(token, "nueva-contrasena-1");
    assertThrows(InvalidResetLinkException.class, () -> service.reset(token, "nueva-contrasena-2"));
  }

  @Test
  void concurrentResetsChangeThePasswordOnce() throws Exception {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    var passwords = List.of("contrasena-hilo-a", "contrasena-hilo-b");
    var barrier = new CyclicBarrier(2);
    var pool = Executors.newFixedThreadPool(2);
    try {
      var futures = new ArrayList<Future<AuthUser>>();
      for (var password : passwords) {
        futures.add(pool.submit(() -> {
          barrier.await(10, TimeUnit.SECONDS);
          return service.reset(token, password);
        }));
      }
      String winner = null;
      int failures = 0;
      for (int i = 0; i < futures.size(); i++) {
        try {
          assertEquals(account.user().id(), futures.get(i).get(30, TimeUnit.SECONDS).id());
          winner = passwords.get(i);
        } catch (java.util.concurrent.ExecutionException e) {
          assertInstanceOf(InvalidResetLinkException.class, e.getCause());
          failures++;
        }
      }
      assertEquals(1, failures, "exactamente un hilo debe fallar");
      assertTrue(winner != null, "exactamente un hilo debe ganar");
      // La contraseña que queda es la del ganador: el perdedor no la sobrescribió.
      var loser = passwords.get(winner.equals(passwords.get(0)) ? 1 : 0);
      assertEquals(account.user().id(), auth.login(new LoginCommand(account.email(), winner)).id());
      assertThrows(UnauthorizedException.class, () -> auth.login(new LoginCommand(account.email(), loser)));
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void newPasswordWorksAndOldOneDoesNot() {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    service.reset(token, "nueva-contrasena-1");
    assertEquals(account.user().id(), auth.login(new LoginCommand(account.username(), "nueva-contrasena-1")).id());
    assertThrows(UnauthorizedException.class,
        () -> auth.login(new LoginCommand(account.username(), "contrasena-vieja-1")));
  }

  @Test
  void malformedTokenIsInvalid() {
    var account = register();
    var token = requestAndGetToken(account.email(), account.email());
    assertThrows(InvalidResetLinkException.class, () -> service.reset("abc", "nueva-contrasena-1"));
    assertThrows(InvalidResetLinkException.class, () -> service.reset("", "nueva-contrasena-1"));
    assertThrows(InvalidResetLinkException.class, () -> service.reset(null, "nueva-contrasena-1"));
    assertThrows(InvalidResetLinkException.class, () -> service.reset(token + ".", "nueva-contrasena-1"));
    assertEquals(account.user().id(), service.reset("  " + token + " \n", "nueva-contrasena-1").id());
  }

  @Test
  void unknownWellFormedTokenIsInvalid() {
    var unknown = "A".repeat(43);
    assertThrows(InvalidResetLinkException.class, () -> service.reset(unknown, "nueva-contrasena-1"));
  }
}
