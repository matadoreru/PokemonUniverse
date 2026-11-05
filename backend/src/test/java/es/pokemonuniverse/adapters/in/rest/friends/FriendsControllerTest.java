package es.pokemonuniverse.adapters.in.rest.friends;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class FriendsControllerTest {

  @Inject @Client("/") HttpClient client;

  private record Account(String id, String cookie, String username) {}

  @SuppressWarnings("unchecked")
  private Account register() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "fr_" + u, "email", "fr" + u + "@mail.com", "password", "0123456789")), Map.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    return new Account((String) ((Map<String, Object>) res.body().get("user")).get("id"), cookie, "fr_" + u);
  }

  @SuppressWarnings("unchecked")
  private HttpResponse<Map<String, Object>> call(MutableHttpRequest<?> request, Account as) {
    if (as != null) request.header("Cookie", as.cookie());
    return (HttpResponse<Map<String, Object>>) (HttpResponse<?>) client.toBlocking().exchange(request, Map.class);
  }

  private HttpClientResponseException fails(MutableHttpRequest<?> request, Account as) {
    return assertThrows(HttpClientResponseException.class, () -> call(request, as));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Object o) {
    return (Map<String, Object>) o;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> list(Object o) {
    return (List<Map<String, Object>>) o;
  }

  @Test
  void guestGets401OnEveryRoute() {
    var guestRes = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/guest", Map.of("displayName", "Invitado")), Map.class);
    var guestCookie = guestRes.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    var guest = new Account("g", guestCookie, "g");
    List<java.util.function.Supplier<MutableHttpRequest<?>>> routes = List.of(
        () -> HttpRequest.GET("/api/friends"),
        () -> HttpRequest.POST("/api/friends/requests", Map.of("username", "alguien")),
        () -> HttpRequest.POST("/api/friends/requests/abc/accept", Map.of()),
        () -> HttpRequest.DELETE("/api/friends/requests/abc"),
        () -> HttpRequest.DELETE("/api/friends/abc"));
    for (var route : routes) {
      for (Account as : new Account[] {null, guest}) {
        var e = fails(route.get(), as);
        assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
        assertEquals(Map.of("error", "Registered account required"), e.getResponse().getBody(Map.class).orElseThrow());
      }
    }
  }

  @Test
  void fullFlowOverHttp() {
    var a = register();
    var b = register();

    var sent = call(HttpRequest.POST("/api/friends/requests", Map.of("username", " " + b.username() + " ")), a);
    assertEquals(HttpStatus.CREATED, sent.status());
    var request = map(sent.body().get("request"));
    var requestId = (String) request.get("id");
    assertEquals(b.id(), map(request.get("to")).get("id"));
    assertEquals(Map.of("type", "DEFAULT"), map(request.get("to")).get("avatar"));

    var overviewB = call(HttpRequest.GET("/api/friends"), b).body();
    assertEquals(List.of(), overviewB.get("friends"));
    assertEquals(List.of(), overviewB.get("outgoing"));
    var incoming = list(overviewB.get("incoming"));
    assertEquals(1, incoming.size());
    assertEquals(requestId, incoming.get(0).get("id"));
    assertEquals(a.id(), map(incoming.get(0).get("from")).get("id"));
    assertEquals(a.username(), map(incoming.get(0).get("from")).get("username"));
    assertTrue(((String) incoming.get(0).get("createdAt")).matches("^\\d{4}-\\d{2}-\\d{2}T.*Z$"));
    assertEquals(1, list(call(HttpRequest.GET("/api/friends"), a).body().get("outgoing")).size());

    var accepted = call(HttpRequest.POST("/api/friends/requests/" + requestId + "/accept", Map.of()), b);
    assertEquals(HttpStatus.OK, accepted.status());
    var friend = map(accepted.body().get("friend"));
    assertEquals(a.id(), friend.get("id"));
    assertEquals("OFFLINE".equals(friend.get("status")) || "ONLINE".equals(friend.get("status")), true);

    for (var who : List.of(a, b)) {
      var friends = list(call(HttpRequest.GET("/api/friends"), who).body().get("friends"));
      assertEquals(1, friends.size());
      assertEquals(who == a ? b.id() : a.id(), friends.get(0).get("id"));
    }

    var removed = client.toBlocking().exchange(HttpRequest.DELETE("/api/friends/" + b.id()).header("Cookie", a.cookie()), String.class);
    assertEquals(HttpStatus.NO_CONTENT, removed.status());
    for (var who : List.of(a, b)) {
      assertEquals(List.of(), call(HttpRequest.GET("/api/friends"), who).body().get("friends"));
    }
  }

  @Test
  void crossedRequestReturns200WithFriend() {
    var a = register();
    var b = register();
    call(HttpRequest.POST("/api/friends/requests", Map.of("username", b.username())), a);
    var crossed = call(HttpRequest.POST("/api/friends/requests", Map.of("username", a.username())), b);
    assertEquals(HttpStatus.OK, crossed.status());
    assertEquals(a.id(), map(crossed.body().get("friend")).get("id"));
  }

  @Test
  void unknownUserIs400WithGenericMessage() {
    var a = register();
    var e = fails(HttpRequest.POST("/api/friends/requests", Map.of("username", "no_existe_" + UUID.randomUUID().toString().substring(0, 8))), a);
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    assertEquals(Map.of("error", "Cannot send a friend request to this user"), e.getResponse().getBody(Map.class).orElseThrow());
  }

  @Test
  void blankUsernameIs400() {
    var a = register();
    var e = fails(HttpRequest.POST("/api/friends/requests", Map.of("username", "   ")), a);
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    assertTrue(e.getResponse().getBody(String.class).orElseThrow().contains("Escribe el nombre de usuario"));
  }

  @Test
  void foreignRequestIs404() {
    var a = register();
    var b = register();
    var c = register();
    var sent = call(HttpRequest.POST("/api/friends/requests", Map.of("username", b.username())), a);
    var requestId = (String) map(sent.body().get("request")).get("id");
    assertEquals(HttpStatus.NOT_FOUND, fails(HttpRequest.POST("/api/friends/requests/" + requestId + "/accept", Map.of()), c).getStatus());
    assertEquals(HttpStatus.NOT_FOUND, fails(HttpRequest.DELETE("/api/friends/requests/" + requestId), c).getStatus());
    assertEquals(HttpStatus.NOT_FOUND, fails(HttpRequest.DELETE("/api/friends/" + c.id()), a).getStatus());
    // el remitente la cancela
    assertEquals(HttpStatus.NO_CONTENT, client.toBlocking()
        .exchange(HttpRequest.DELETE("/api/friends/requests/" + requestId).header("Cookie", a.cookie()), String.class).status());
  }
}
