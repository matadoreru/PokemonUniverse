package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.body;
import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.json;
import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.application.auth.IdentityTokens;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * {@code router.use(requireAdmin)}: 401 sin sesión o con invitado y 403 si el rol leído de la BD no es ADMIN, en
 * todas las rutas de {@code /api/admin} (incluidas las que no existen) y antes de validar nada.
 */
@MicronautTest(transactional = false)
class AdminGateTest {

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject ObjectMapper mapper;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  private AdminTestSupport support;

  @BeforeEach
  void setUp() {
    support = new AdminTestSupport(client, tokens, mapper, dataSource, resolver);
  }

  private static List<MutableHttpRequest<?>> everyRoute() {
    var routes = new ArrayList<MutableHttpRequest<?>>();
    for (var path : List.of("summary", "active-rooms?page=0", "rooms?search=" + "x".repeat(81), "games?status=X",
        "users?role=X", "data-sync", "changelog", "feedback?page=abc", "nope")) {
      routes.add(HttpRequest.GET("/api/admin/" + path));
    }
    routes.add(json(HttpRequest.POST("/api/admin/data-sync/bogus", "{\"full\":true}")));
    routes.add(json(HttpRequest.POST("/api/admin/changelog", "{\"bad\":1}")));
    routes.add(json(HttpRequest.PATCH("/api/admin/changelog/" + "x".repeat(200), "{}")));
    routes.add(HttpRequest.DELETE("/api/admin/changelog/x"));
    routes.add(json(HttpRequest.PATCH("/api/admin/feedback/x/status", "{\"status\":\"X\"}")));
    return routes;
  }

  @Test
  void anonymousAndGuestsGet401BeforeAnyValidation() {
    for (var cookie : new String[] {null, support.guestCookie()}) {
      for (var request : everyRoute()) {
        var e = support.fails(request, cookie);
        assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus(), request.getPath());
        assertEquals("{\"error\":\"Registered account required\"}", body(e), request.getPath());
      }
    }
  }

  @Test
  void usersGet403AndAPromotionAppliesWithoutLoggingInAgain() throws Exception {
    var account = support.register();
    for (var request : everyRoute()) {
      var e = support.fails(request, account.cookie());
      assertEquals(HttpStatus.FORBIDDEN, e.getStatus(), request.getPath());
      assertEquals("{\"error\":\"Administrator access required\"}", body(e), request.getPath());
    }
    support.execute("UPDATE \"User\" SET role = 'ADMIN' WHERE id = ?", account.id());
    assertEquals(HttpStatus.OK, support.send(HttpRequest.GET("/api/admin/summary"), account.cookie()).getStatus());
    // Degradado de nuevo: el rol se relee en cada petición.
    support.execute("UPDATE \"User\" SET role = 'USER' WHERE id = ?", account.id());
    assertEquals(HttpStatus.FORBIDDEN, support.fails(HttpRequest.GET("/api/admin/summary"), account.cookie()).getStatus());
  }

  @Test
  void aDeletedAccountGets403() throws Exception {
    var account = support.admin();
    support.execute("DELETE FROM \"User\" WHERE id = ?", account.id());
    var e = support.fails(HttpRequest.GET("/api/admin/summary"), account.cookie());
    assertEquals(HttpStatus.FORBIDDEN, e.getStatus());
    assertEquals("{\"error\":\"Administrator access required\"}", body(e));
  }
}
