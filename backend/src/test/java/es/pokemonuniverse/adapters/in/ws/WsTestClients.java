package es.pokemonuniverse.adapters.in.ws;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.websocket.WebSocketClient;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.reactivestreams.Publisher;
import org.reactivestreams.Subscriber;
import org.reactivestreams.Subscription;

/** Abre {@link TestSocket}s autenticados contra {@code /ws} y los cierra al final de cada test. */
final class WsTestClients {

  private final WebSocketClient client;
  private final IdentityTokens tokens;
  private final List<TestSocket> opened = new ArrayList<>();

  WsTestClients(WebSocketClient client, IdentityTokens tokens) {
    this.client = client;
    this.tokens = tokens;
  }

  MutableHttpRequest<?> user(String id, String name) {
    var identity = new AuthUser(id, name, AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
    return HttpRequest.GET("/ws").cookie(Cookie.of("pu_session", tokens.sign(identity, Instant.now())));
  }

  TestSocket connect(MutableHttpRequest<?> request) {
    var socket = first(client.connect(TestSocket.class, request));
    opened.add(socket);
    return socket;
  }

  void closeAll() {
    for (var socket : opened) closeQuietly(socket);
    opened.clear();
  }

  static void closeQuietly(TestSocket socket) {
    try {
      socket.close();
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }

  static void assertOk(JsonNode ack) {
    assertTrue(ack.get("ok").getBooleanValue(), ack.toString());
    assertTrue(ack.get("data") != null, ack.toString());
  }

  static void assertError(String message, JsonNode ack) {
    assertFalse(ack.get("ok").getBooleanValue(), ack.toString());
    assertEquals(message, ack.get("error").getStringValue());
    assertTrue(ack.get("data") == null, ack.toString());
  }

  /** Primer elemento de un {@link Publisher} sin depender de Reactor. */
  private static <T> T first(Publisher<T> publisher) {
    var result = new CompletableFuture<T>();
    publisher.subscribe(new Subscriber<T>() {
      @Override
      public void onSubscribe(Subscription subscription) {
        subscription.request(1);
      }

      @Override
      public void onNext(T value) {
        result.complete(value);
      }

      @Override
      public void onError(Throwable error) {
        result.completeExceptionally(error);
      }

      @Override
      public void onComplete() {
        result.completeExceptionally(new AssertionError("Sin conexión"));
      }
    });
    return result.orTimeout(TestSocket.WAIT.toMillis(), TimeUnit.MILLISECONDS).join();
  }
}
