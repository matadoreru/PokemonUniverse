package es.pokemonuniverse.adapters.in.rest.games;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.core.type.Argument;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest
class GamesControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject ObjectMapper om;

  @Test
  void listsGamesWithDefaultConfig() throws Exception {
    var response = client.toBlocking().exchange(HttpRequest.GET("/api/games"), String.class);
    assertEquals(HttpStatus.OK, response.status());
    var games = games(response.body());
    assertEquals(31, games.size());
    var first = games.get(0);
    assertTrue(first.containsKey("defaultConfig"));
    var metrics = (List<?>) ((Map<?, ?>) first.get("profileStats")).get("metrics");
    assertFalse(metrics.isEmpty());
  }

  @Test
  void servesTheExportedRegistryVerbatim() throws Exception {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/games"), String.class);
    var served = games(body);
    var exported = om.readValue(Files.readString(Path.of("src/main/resources/games/registry.json")),
        Argument.listOf(Argument.mapOf(Argument.STRING, Argument.OBJECT_ARGUMENT)));
    // mismas claves, mismos valores y tipos numericos (30 no se convierte en 30.0), sin nulos
    assertEquals(exported, served);
  }

  private List<Map<String, Object>> games(String body) throws Exception {
    Map<String, Object> root = om.readValue(body, Argument.mapOf(Argument.STRING, Argument.OBJECT_ARGUMENT));
    @SuppressWarnings("unchecked")
    var games = (List<Map<String, Object>>) root.get("games");
    return games;
  }
}
