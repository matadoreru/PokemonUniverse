package es.pokemonuniverse.adapters.in.rest.changelog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.ChangelogEntity;
import es.pokemonuniverse.adapters.out.persistence.ChangelogRepository;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class ChangelogControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject ChangelogRepository repo;

  private final List<String> ids = new ArrayList<>();

  @AfterEach
  void cleanup() {
    ids.forEach(repo::deleteById);
    ids.clear();
  }

  private String insert(String version, Instant date, boolean published, List<Object> content) {
    return insert(version, null, date, published, content);
  }

  private String insert(String version, String summary, Instant date, boolean published, List<Object> content) {
    var id = "cl_" + UUID.randomUUID();
    ids.add(id);
    var now = Instant.parse("2026-01-01T00:00:00.123Z");
    repo.save(ChangelogEntity.create(id, version + "-" + id, "Titulo " + version, summary, date, published, content,
        now));
    return id;
  }

  private static List<Object> ok() {
    return List.of(Map.of("type", "NEW", "text", "  Algo nuevo  "));
  }

  private String body() {
    return client.toBlocking().retrieve(HttpRequest.GET("/api/changelog"), String.class);
  }

  @Test
  @SuppressWarnings("unchecked")
  void listsOnlyPublishedNewestFirst() {
    var older = insert("a", Instant.parse("2090-01-01T00:00:00Z"), true, ok());
    var newer = insert("b", Instant.parse("2090-06-01T10:20:30.456Z"), true, ok());
    insert("c", Instant.parse("2090-12-01T00:00:00Z"), false, ok());

    var res = client.toBlocking().exchange(HttpRequest.GET("/api/changelog"), Map.class);
    var entries = (List<Map<String, Object>>) res.body().get("entries");
    var mine = entries.stream().filter(e -> ids.contains((String) e.get("id"))).toList();
    assertEquals(List.of(newer, older), mine.stream().map(e -> e.get("id")).toList());
    var first = mine.get(0);
    assertEquals("2090-06-01T10:20:30.456Z", first.get("date"));
    assertEquals("2026-01-01T00:00:00.123Z", first.get("createdAt"));
    assertEquals(true, first.get("published"));
    assertEquals(List.of(Map.of("type", "NEW", "text", "Algo nuevo")), first.get("content"));
    // Las filas sin resumen ni destacados no llevan esas claves.
    assertFalse(first.containsKey("summary"));
  }

  @Test
  void returnsSummaryAndOnlyTrueHighlights() {
    var id = insert("d", "Resumen corto", Instant.parse("2090-02-01T00:00:00Z"), true, List.of(
        Map.of("type", "NEW", "text", "Destacado", "highlight", true),
        Map.of("type", "BUGS", "text", "Normal", "highlight", false),
        Map.of("type", "BUGS", "text", "Sin clave")));
    var body = body();
    assertTrue(body.contains("{\"id\":\"" + id + "\",\"version\":\"d-" + id + "\",\"title\":\"Titulo d\","
        + "\"summary\":\"Resumen corto\",\"date\":\"2090-02-01T00:00:00.000Z\",\"published\":true,\"content\":["
        + "{\"type\":\"NEW\",\"text\":\"Destacado\",\"highlight\":true},{\"type\":\"BUGS\",\"text\":\"Normal\"},"
        + "{\"type\":\"BUGS\",\"text\":\"Sin clave\"}],"), body);
  }

  @Test
  void setsCacheControlHeader() {
    var res = client.toBlocking().exchange(HttpRequest.GET("/api/changelog"), Map.class);
    assertEquals("public, max-age=0, must-revalidate", res.getHeaders().get("Cache-Control"));
  }

  @Test
  void emptyIsEmptyArray() {
    // La BD de test solo tiene publicadas las notas sembradas por V5 (el resto de clases limpia lo suyo): se ocultan
    // mientras dura la prueba y se vuelven a publicar al acabar.
    var seeded = repo.findByPublishedTrueOrderByDateDescAndCreatedAtDesc();
    try {
      seeded.forEach(entry -> setPublished(entry, false));
      assertEquals("{\"entries\":[]}", body());
    } finally {
      seeded.forEach(entry -> setPublished(entry, true));
    }
  }

  private void setPublished(ChangelogEntity entry, boolean published) {
    entry.update(null, null, null, null, published, null, entry.getUpdatedAt());
    repo.update(entry);
  }

  @Test
  void migrationSeedsPublishedPatchNotesUpToV050() {
    var seeded = repo.findByPublishedTrueOrderByDateDescAndCreatedAtDesc().stream()
        .map(ChangelogEntity::getVersion).filter(v -> v.matches("0\\.[1-5]\\.0")).toList();
    assertEquals(List.of("0.5.0", "0.4.0", "0.3.0", "0.2.0", "0.1.0"), seeded);
    var latest = repo.findByVersion("0.5.0").orElseThrow();
    assertEquals("Nueva imagen Arcade", latest.getTitle());
    assertEquals(3, latest.getContent().stream().filter(c -> ((Map<?, ?>) c).containsKey("highlight")).count());
  }

  @Test
  void invalidContentIs500() {
    insert("bad", Instant.parse("2090-01-01T00:00:00Z"), true,
        List.of(Map.of("type", "WRONG", "text", "texto valido")));
    var e = assertThrows(HttpClientResponseException.class, this::body);
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, e.getStatus());
  }

  @Test
  void nonBooleanHighlightIs500() {
    insert("bad-hl", Instant.parse("2090-01-01T00:00:00Z"), true,
        List.of(Map.of("type", "NEW", "text", "texto valido", "highlight", "sí")));
    var e = assertThrows(HttpClientResponseException.class, this::body);
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, e.getStatus());
  }
}
