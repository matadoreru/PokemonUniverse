package es.pokemonuniverse.adapters.in.rest.admin;

import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.MediaType;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.serde.ObjectMapper;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;

/** Cuentas, cookies y SQL de siembra compartidos por las pruebas HTTP de {@code /api/admin}. */
final class AdminTestSupport {

  record Account(String id, String username, String cookie) {}

  private final HttpClient client;
  private final IdentityTokens tokens;
  private final ObjectMapper mapper;
  private final DataSource dataSource;
  private final DataSourceResolver resolver;

  AdminTestSupport(HttpClient client, IdentityTokens tokens, ObjectMapper mapper, DataSource dataSource,
      DataSourceResolver resolver) {
    this.client = client;
    this.tokens = tokens;
    this.mapper = mapper;
    this.dataSource = dataSource;
    this.resolver = resolver;
  }

  static String tag() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 10);
  }

  /** Usuario real registrado por la API (la cookie lleva el rol USER). */
  @SuppressWarnings("unchecked")
  Account register(String username, String email) throws Exception {
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", username, "email", email, "password", "0123456789")), String.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    var user = (Map<String, Object>) mapper.readValue(res.body(), Map.class).get("user");
    return new Account((String) user.get("id"), username, cookie);
  }

  Account register() throws Exception {
    var t = tag();
    return register("ad_" + t, "ad" + t + "@mail.com");
  }

  /** Administrador: se asciende en la BD; la cookie emitida al registrarse sigue diciendo USER. */
  Account admin() throws Exception {
    var account = register();
    execute("UPDATE \"User\" SET role = 'ADMIN' WHERE id = ?", account.id());
    return account;
  }

  String guestCookie() {
    var guest = new AuthUser("guest-" + UUID.randomUUID(), "Ash", AuthUser.Kind.GUEST, null, null,
        new AvatarRef.Default());
    return "pu_session=" + tokens.sign(guest, Instant.now());
  }

  void execute(String sql, Object... params) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement(sql)) {
      for (int i = 0; i < params.length; i++) statement.setObject(i + 1, params[i]);
      statement.executeUpdate();
    }
  }

  long count(String sql) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement(sql);
        var rs = statement.executeQuery()) {
      rs.next();
      return rs.getLong(1);
    }
  }

  HttpResponse<String> send(MutableHttpRequest<?> request, @Nullable String cookie) {
    if (cookie != null) request.header("Cookie", cookie);
    return client.toBlocking().exchange(request, String.class);
  }

  String get(String path, String cookie) {
    return send(HttpRequest.GET(path), cookie).body();
  }

  HttpClientResponseException fails(MutableHttpRequest<?> request, @Nullable String cookie) {
    return assertThrows(HttpClientResponseException.class, () -> send(request, cookie));
  }

  static MutableHttpRequest<String> json(MutableHttpRequest<String> request) {
    return request.contentType(MediaType.APPLICATION_JSON_TYPE);
  }

  static String body(HttpClientResponseException e) {
    return e.getResponse().getBody(String.class).orElseThrow();
  }
}
