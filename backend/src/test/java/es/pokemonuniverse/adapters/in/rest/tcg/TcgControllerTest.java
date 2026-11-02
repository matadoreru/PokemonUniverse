package es.pokemonuniverse.adapters.in.rest.tcg;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.datasync.tcg.TcgTables;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** {@code GET /api/tcg/options} y {@code POST /api/tcg/eligibility} ({@code apps/server/src/http/routes.ts}). */
@MicronautTest(transactional = false)
class TcgControllerTest {

  private static final String VALID = "{\"generations\":[1],\"setIds\":[],\"rarities\":[],\"minPrice\":null,"
      + "\"maxPrice\":null,\"showRarity\":true,\"rounds\":10,\"roundSeconds\":15}";

  @Inject
  @Client("/")
  HttpClient client;

  @Inject CachedTcgCardCatalog catalog;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  @BeforeEach
  void seed() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      TcgTables.clear(connection);
      TcgTables.seedCatalog(connection);
    }
    catalog.refresh();
  }

  @AfterEach
  void clean() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      TcgTables.clear(connection);
      TcgTables.deletePokemon(connection);
    }
    catalog.refresh();
  }

  private String post(String body) {
    return client.toBlocking().retrieve(HttpRequest.POST("/api/tcg/eligibility", body)
        .contentType(MediaType.APPLICATION_JSON_TYPE), String.class);
  }

  private HttpClientResponseException postError(String body) {
    return assertThrows(HttpClientResponseException.class, () -> post(body));
  }

  @Test
  void optionsHaveNodeShapeAndKeyOrder() {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/tcg/options"), String.class);
    assertEquals("{\"ready\":true,\"cardCount\":3,\"generations\":[{\"value\":1,\"cardCount\":3}],"
        + "\"sets\":[{\"id\":\"base1\",\"name\":\"Base Set\",\"cardCount\":3}],"
        + "\"rarities\":[{\"value\":\"Rare\",\"cardCount\":3}]}", body);
  }

  @Test
  void eligibilityCountsTheCardsOfTheFullConfig() {
    assertEquals("{\"cardCount\":3}", post(VALID));
    assertEquals("{\"cardCount\":2}", post(VALID.replace("\"minPrice\":null", "\"minPrice\":\"2\"")));
    assertEquals("{\"cardCount\":0}", post(VALID.replace("[1]", "[9]")));
  }

  @Test
  void eligibilityRejectsMaxBelowMinWithZodIssues() {
    var error = postError(VALID.replace("\"minPrice\":null", "\"minPrice\":\"2\"")
        .replace("\"maxPrice\":null", "\"maxPrice\":\"1.10\""));
    assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
    assertEquals("{\"error\":\"El precio máximo debe ser igual o mayor que el mínimo.\",\"issues\":[{\"code\":\"custom\","
        + "\"path\":[\"maxPrice\"],\"message\":\"El precio máximo debe ser igual o mayor que el mínimo.\"}]}",
        error.getResponse().getBody(String.class).orElseThrow());
  }

  @Test
  void eligibilityWithoutBodyValidatesAnEmptyObject() {
    var error = assertThrows(HttpClientResponseException.class, () -> client.toBlocking().retrieve(
        HttpRequest.POST("/api/tcg/eligibility", "").contentType(MediaType.APPLICATION_JSON_TYPE), String.class));
    assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
    var body = error.getResponse().getBody(String.class).orElseThrow();
    assertEquals(true, body.startsWith("{\"error\":\"Invalid input: expected array, received undefined\",\"issues\":"
        + "[{\"expected\":\"array\",\"code\":\"invalid_type\",\"path\":[\"generations\"]"), body);
  }

  /** {@code compareTcgPrices} lanza dentro del {@code parse} de Zod: Node responde 500 con el mensaje (fuera de prod). */
  @Test
  void aNonCanonicalPriceWithAnotherPriceIsA500LikeNode() {
    var error = postError(VALID.replace("\"minPrice\":null", "\"minPrice\":\"abc\"")
        .replace("\"maxPrice\":null", "\"maxPrice\":\"1\""));
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, error.getStatus());
    assertEquals("{\"error\":\"Invalid canonical TCG price\"}", error.getResponse().getBody(String.class).orElseThrow());
  }

  /** Antes del primer {@code refresh} (o sin catálogo) Node lanza un Error plano: 500 con su mensaje. */
  @Test
  void anUnloadedCatalogAnswersTheNodeLiteral() {
    for (var controller : List.of(new TcgController(new CachedTcgCardCatalog(List::of)), new TcgController(null))) {
      assertEquals(TcgController.NOT_READY, assertThrows(IllegalStateException.class, controller::options)
          .getMessage());
      assertEquals(TcgController.NOT_READY, assertThrows(IllegalStateException.class,
          () -> controller.eligibility(null)).getMessage());
    }
    assertEquals("El catálogo TCG todavía no está disponible.", TcgController.NOT_READY);
  }
}
