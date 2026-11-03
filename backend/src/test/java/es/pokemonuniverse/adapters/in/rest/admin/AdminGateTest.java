package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.body;
import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.runtime.server.EmbeddedServer;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
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
  @Inject EmbeddedServer server;

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

  /**
   * Variantes de ruta que nginx reenvía sin normalizar ({@code proxy_pass} sin URI; comprobado con un backend de eco,
   * ver el informe de la tarea 5 del corte 2D). Se envían por un socket para que ningún cliente HTTP las reescriba.
   * Nunca 200: o el filtro las guarda (401/403) o no hay ruta (404).
   */
  @Test
  void pathVariantsNeverReachAnAdminRouteWithoutTheGate() throws Exception {
    var account = support.register();
    for (var path : List.of("/api/admin/", "//api/admin/users", "/api/%61dmin/users", "/api/ADMIN/users",
        "/api/admin/../admin/users", "/api/./admin/users", "/api//admin/users", "/api/admin//users",
        "/api/admin/users/", "/api/admin/users;x=1", "/api/admin/%75sers", "/api/admin%2Fusers")) {
      for (var cookie : new String[] {null, account.cookie()}) {
        var status = rawGet(path, cookie);
        assertTrue(status == 401 || status == 403 || status == 404,
            path + (cookie == null ? " sin sesión" : " con USER") + " → " + status);
      }
    }
  }

  /** GET con la ruta literal; devuelve el código de estado. */
  private int rawGet(String path, String cookie) throws IOException {
    try (var socket = new Socket(server.getHost(), server.getPort())) {
      socket.setSoTimeout(10_000);
      OutputStream out = socket.getOutputStream();
      var request = "GET " + path + " HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n"
          + (cookie == null ? "" : "Cookie: " + cookie + "\r\n") + "\r\n";
      out.write(request.getBytes(StandardCharsets.US_ASCII));
      out.flush();
      InputStream in = socket.getInputStream();
      var line = new StringBuilder();
      for (int c = in.read(); c != -1 && c != '\n'; c = in.read()) line.append((char) c);
      return Integer.parseInt(line.toString().split(" ")[1]);
    }
  }
}
