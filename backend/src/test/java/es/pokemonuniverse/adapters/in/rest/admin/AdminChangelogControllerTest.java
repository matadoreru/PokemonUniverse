package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.body;
import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.ChangelogEntity;
import es.pokemonuniverse.adapters.out.persistence.ChangelogRepository;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.changelog.ChangelogWriter;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** {@code createAdminChangelogRouter}: CRUD de novedades con los esquemas Zod que antes estaban en {@code shared/changelog.ts}. */
@MicronautTest(transactional = false)
class AdminChangelogControllerTest {

  private static final String ISO = "\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z";

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject ObjectMapper mapper;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject ChangelogRepository repository;
  @Inject ChangelogWriter writer;

  private AdminTestSupport support;
  private AdminTestSupport.Account admin;

  @BeforeEach
  void setUp() throws Exception {
    support = new AdminTestSupport(client, tokens, mapper, dataSource, resolver);
    admin = support.admin();
  }

  /** La BD de pruebas es compartida: otras pruebas esperan el changelog vacío. Todas las versiones de aquí son 77.x.y. */
  @AfterEach
  void removeEntries() throws Exception {
    support.execute("DELETE FROM \"Changelog\" WHERE version LIKE '77.%'");
  }

  private static String version() {
    var random = ThreadLocalRandom.current();
    return "77." + random.nextInt(1_000_000) + "." + random.nextInt(1_000_000);
  }

  private static String entry(String version, String date, boolean published) {
    return "{\"version\":\"" + version + "\",\"title\":\"  Gran cambio  \",\"date\":\"" + date + "\",\"published\":"
        + published + ",\"content\":[{\"type\":\"NEW\",\"text\":\"  Algo nuevo  \"},{\"text\":\"Arreglos\","
        + "\"type\":\"BUGS\"}]}";
  }

  @SuppressWarnings("unchecked")
  private String create(String body) throws Exception {
    var res = support.send(json(HttpRequest.POST("/api/admin/changelog", body)), admin.cookie());
    assertEquals(HttpStatus.CREATED, res.getStatus());
    return (String) ((Map<String, Object>) mapper.readValue(res.body(), Map.class).get("entry")).get("id");
  }

  @Test
  void createsWithTrimmedFieldsAndUtcMillisecondDate() throws Exception {
    var v = version();
    var res = support.send(json(HttpRequest.POST("/api/admin/changelog",
        entry(v, "2026-11-02T10:00:00.123999+02:00", true))), admin.cookie());
    assertEquals(HttpStatus.CREATED, res.getStatus());
    assertTrue(res.body().matches("\\{\"entry\":\\{\"id\":\"[^\"]+\",\"version\":\"" + v.replace(".", "\\.")
        + "\",\"title\":\"Gran cambio\",\"date\":\"2026-11-02T08:00:00\\.123Z\",\"published\":true,\"content\":"
        + "\\[\\{\"type\":\"NEW\",\"text\":\"Algo nuevo\"},\\{\"type\":\"BUGS\",\"text\":\"Arreglos\"}],\"createdAt\":\""
        + ISO + "\",\"updatedAt\":\"" + ISO + "\"}}"), res.body());

    var duplicate = support.fails(json(HttpRequest.POST("/api/admin/changelog", entry(v, "2026-11-02T10:00:00Z",
        false))), admin.cookie());
    assertEquals(HttpStatus.CONFLICT, duplicate.getStatus());
    assertEquals("{\"error\":\"Ya existe una entrada con esta versión.\"}", body(duplicate));

    // Desplazamientos que Zod admite y java.time no (hasta ±23:59).
    var far = create(entry(version(), "2026-11-02T10:00:00-23:59", false));
    assertTrue(support.get("/api/admin/changelog", admin.cookie()).contains("{\"id\":\"" + far + "\","));
  }

  @Test
  void storesSummaryAndOnlyTrueHighlights() throws Exception {
    var v = version();
    var res = support.send(json(HttpRequest.POST("/api/admin/changelog", "{\"version\":\"" + v + "\",\"title\":"
        + "\"Gran cambio\",\"summary\":\"  Lo más nuevo  \",\"date\":\"2026-11-02T10:00:00Z\",\"content\":["
        + "{\"type\":\"NEW\",\"text\":\"Algo nuevo\",\"highlight\":true},{\"highlight\":false,\"type\":\"BUGS\","
        + "\"text\":\"Arreglos\"}]}")), admin.cookie());
    assertEquals(HttpStatus.CREATED, res.getStatus());
    assertTrue(res.body().matches("\\{\"entry\":\\{\"id\":\"[^\"]+\",\"version\":\"" + v.replace(".", "\\.")
        + "\",\"title\":\"Gran cambio\",\"summary\":\"Lo más nuevo\",\"date\":\"2026-11-02T10:00:00\\.000Z\","
        + "\"published\":false,\"content\":\\[\\{\"type\":\"NEW\",\"text\":\"Algo nuevo\",\"highlight\":true},"
        + "\\{\"type\":\"BUGS\",\"text\":\"Arreglos\"}],\"createdAt\":\"" + ISO + "\",\"updatedAt\":\"" + ISO
        + "\"}}"), res.body());
    @SuppressWarnings("unchecked")
    var id = (String) ((Map<String, Object>) mapper.readValue(res.body(), Map.class).get("entry")).get("id");
    // En la BD solo se guarda highlight: true; un false no deja la clave.
    var stored = repository.findById(id).orElseThrow();
    assertEquals("Lo más nuevo", stored.getSummary());
    assertEquals(List.of(Map.of("type", "NEW", "text", "Algo nuevo", "highlight", true),
        Map.of("type", "BUGS", "text", "Arreglos")), stored.getContent());

    // Sin summary en la edición, se conserva; la cadena vacía (tras recortar) lo borra.
    var kept = support.send(json(HttpRequest.PATCH("/api/admin/changelog/" + id, "{\"published\":true}")),
        admin.cookie());
    assertTrue(kept.body().contains("\"summary\":\"Lo más nuevo\","), kept.body());
    var cleared = support.send(json(HttpRequest.PATCH("/api/admin/changelog/" + id, "{\"summary\":\"   \"}")),
        admin.cookie());
    assertEquals(HttpStatus.OK, cleared.getStatus());
    assertTrue(cleared.body().contains("\"title\":\"Gran cambio\",\"date\":"), cleared.body());
    assertNull(repository.findById(id).orElseThrow().getSummary());

    // Un resumen vacío al crear es lo mismo que no enviarlo.
    var blank = support.send(json(HttpRequest.POST("/api/admin/changelog", "{\"version\":\"" + version()
        + "\",\"title\":\"Sin resumen\",\"summary\":\"\",\"date\":\"2026-11-02T10:00:00Z\",\"content\":["
        + "{\"type\":\"NEW\",\"text\":\"Algo nuevo\"}]}")), admin.cookie());
    assertEquals(HttpStatus.CREATED, blank.getStatus());
    assertTrue(blank.body().contains("\"title\":\"Sin resumen\",\"date\":"), blank.body());
  }

  @Test
  void listsEverythingByDateThenCreation() throws Exception {
    var older = create(entry(version(), "2001-01-01T00:00:00Z", true));
    var hidden = create(entry(version(), "2001-01-02T00:00:00Z", false));
    var sameDayLater = create(entry(version(), "2001-01-02T00:00:00Z", true));
    var list = support.get("/api/admin/changelog", admin.cookie());
    assertTrue(list.startsWith("{\"entries\":["), list);
    var order = List.of(list.indexOf(sameDayLater), list.indexOf(hidden), list.indexOf(older));
    assertTrue(order.get(0) > 0 && order.get(0) < order.get(1) && order.get(1) < order.get(2), list);
    // El público sigue sin ver la entrada no publicada.
    assertTrue(!support.get("/api/changelog", null).contains(hidden));
  }

  @Test
  void updatesOnlyTheFieldsSent() throws Exception {
    var id = create(entry(version(), "2026-11-02T10:00:00Z", true));
    var renamed = support.send(json(HttpRequest.PATCH("/api/admin/changelog/" + id, "{\"title\":\" Nuevo título \"}")),
        admin.cookie());
    assertEquals(HttpStatus.OK, renamed.getStatus());
    // Sin published en la edición, la entrada sigue publicada.
    assertTrue(renamed.body().contains("\"title\":\"Nuevo título\",\"date\":\"2026-11-02T10:00:00.000Z\","
        + "\"published\":true,"), renamed.body());
    var empty = support.send(json(HttpRequest.PATCH("/api/admin/changelog/" + id, "{}")), admin.cookie());
    assertEquals(HttpStatus.OK, empty.getStatus());
    assertTrue(empty.body().contains("\"published\":true,"), empty.body());
    var unpublished = support.send(json(HttpRequest.PATCH("/api/admin/changelog/" + id, "{\"published\":false}")),
        admin.cookie());
    assertTrue(unpublished.body().contains("\"published\":false,"), unpublished.body());

    var other = version();
    create(entry(other, "2026-11-02T10:00:00Z", false));
    var duplicate = support.fails(json(HttpRequest.PATCH("/api/admin/changelog/" + id,
        "{\"version\":\"" + other + "\"}")), admin.cookie());
    assertEquals(HttpStatus.CONFLICT, duplicate.getStatus());
    // La versión duplicada se comprueba antes que la existencia.
    var missingDuplicate = support.fails(json(HttpRequest.PATCH("/api/admin/changelog/missing",
        "{\"version\":\"" + other + "\"}")), admin.cookie());
    assertEquals(HttpStatus.CONFLICT, missingDuplicate.getStatus());
    var missing = support.fails(json(HttpRequest.PATCH("/api/admin/changelog/missing", "{\"published\":true}")),
        admin.cookie());
    assertEquals(HttpStatus.NOT_FOUND, missing.getStatus());
    assertEquals("{\"error\":\"Versión no encontrada.\"}", body(missing));

    assertEquals(HttpStatus.NO_CONTENT, support.send(HttpRequest.DELETE("/api/admin/changelog/" + id),
        admin.cookie()).getStatus());
    var gone = support.fails(HttpRequest.DELETE("/api/admin/changelog/" + id), admin.cookie());
    assertEquals(HttpStatus.NOT_FOUND, gone.getStatus());
    assertEquals("{\"error\":\"Versión no encontrada.\"}", body(gone));
  }

  @Test
  void validationIssuesMatchZod() {
    var invalid = support.fails(json(HttpRequest.POST("/api/admin/changelog", "{\"zz\":1,\"version\":\" 1.2 \","
        + "\"title\":\"ab\",\"date\":\"2026-11-02\",\"published\":\"yes\",\"content\":[{\"type\":\"X\",\"text\":\" a \","
        + "\"more\":1},\"str\",null],\"aa\":2}")), admin.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, invalid.getStatus());
    assertEquals("{\"error\":\"Usa una versión como 0.8.0.\",\"issues\":["
        + "{\"origin\":\"string\",\"code\":\"invalid_format\",\"format\":\"regex\",\"pattern\":"
        + "\"/^\\\\d+\\\\.\\\\d+\\\\.\\\\d+(?:-[0-9A-Za-z.-]+)?$/\",\"path\":[\"version\"],\"message\":\"Usa una versión "
        + "como 0.8.0.\"},"
        + "{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":3,\"inclusive\":true,\"path\":[\"title\"],"
        + "\"message\":\"Too small: expected string to have >=3 characters\"},"
        + "{\"origin\":\"string\",\"code\":\"invalid_format\",\"format\":\"datetime\",\"pattern\":\"/^(?:(?:\\\\d\\\\d"
        + "[2468][048]|\\\\d\\\\d[13579][26]|\\\\d\\\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\\\d{4}-(?:(?:0[13578]|1"
        + "[02])-(?:0[1-9]|[12]\\\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\\\d|30)|(?:02)-(?:0[1-9]|1\\\\d|2[0-8])))T(?:"
        + "(?:[01]\\\\d|2[0-3]):[0-5]\\\\d:[0-5]\\\\d(?:\\\\.\\\\d+)?(?:Z|([+-](?:[01]\\\\d|2[0-3]):[0-5]\\\\d)))$/\","
        + "\"path\":[\"date\"],\"message\":\"Invalid ISO datetime\"},"
        + "{\"expected\":\"boolean\",\"code\":\"invalid_type\",\"path\":[\"published\"],\"message\":\"Invalid input: "
        + "expected boolean, received string\"},"
        + "{\"code\":\"invalid_value\",\"values\":[\"NEW\",\"MINIGAMES\",\"BALANCE\",\"INTERFACE\",\"IMPROVEMENTS\","
        + "\"BUGS\",\"TECHNICAL\"],\"path\":[\"content\",0,\"type\"],\"message\":\"Invalid option: expected one of "
        + "\\\"NEW\\\"|\\\"MINIGAMES\\\"|\\\"BALANCE\\\"|\\\"INTERFACE\\\"|\\\"IMPROVEMENTS\\\"|\\\"BUGS\\\"|\\\"TECHNICAL\\\"\"},"
        + "{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":3,\"inclusive\":true,\"path\":[\"content\",0,"
        + "\"text\"],\"message\":\"Describe el cambio con al menos 3 caracteres.\"},"
        + "{\"code\":\"unrecognized_keys\",\"keys\":[\"more\"],\"path\":[\"content\",0],\"message\":\"Unrecognized key: "
        + "\\\"more\\\"\"},"
        + "{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[\"content\",1],\"message\":\"Invalid input: "
        + "expected object, received string\"},"
        + "{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[\"content\",2],\"message\":\"Invalid input: "
        + "expected object, received null\"},"
        + "{\"code\":\"unrecognized_keys\",\"keys\":[\"zz\",\"aa\"],\"path\":[],\"message\":\"Unrecognized keys: "
        + "\\\"zz\\\", \\\"aa\\\"\"}]}", body(invalid));

    var missing = support.fails(json(HttpRequest.POST("/api/admin/changelog", "{}")), admin.cookie());
    assertEquals("{\"error\":\"Invalid input: expected string, received undefined\",\"issues\":["
        + "{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"version\"],\"message\":\"Invalid input: "
        + "expected string, received undefined\"},{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":"
        + "[\"title\"],\"message\":\"Invalid input: expected string, received undefined\"},{\"expected\":\"string\","
        + "\"code\":\"invalid_type\",\"path\":[\"date\"],\"message\":\"Invalid input: expected string, received "
        + "undefined\"},{\"expected\":\"array\",\"code\":\"invalid_type\",\"path\":[\"content\"],\"message\":\"Invalid "
        + "input: expected array, received undefined\"}]}", body(missing));

    var sizes = support.fails(json(HttpRequest.POST("/api/admin/changelog", "{\"version\":\"1.0.0\",\"title\":\""
        + "t".repeat(121) + "\",\"date\":\"2026-11-02T10:00:00Z\",\"content\":[]}")), admin.cookie());
    assertTrue(body(sizes).endsWith("{\"origin\":\"array\",\"code\":\"too_small\",\"minimum\":1,\"inclusive\":true,"
        + "\"path\":[\"content\"],\"message\":\"Añade al menos un cambio.\"}]}"), body(sizes));
    assertTrue(body(sizes).contains("\"maximum\":120,"), body(sizes));

    var summaryAndHighlight = support.fails(json(HttpRequest.POST("/api/admin/changelog", "{\"version\":\"1.0.0\","
        + "\"title\":\"Título\",\"summary\":\"" + "s".repeat(201) + "\",\"date\":\"2026-11-02T10:00:00Z\","
        + "\"content\":[{\"zz\":1,\"highlight\":\"sí\",\"text\":\"ab\",\"type\":\"X\"}]}")), admin.cookie());
    assertEquals("{\"error\":\"Too big: expected string to have <=200 characters\",\"issues\":["
        + "{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":200,\"inclusive\":true,\"path\":[\"summary\"],"
        + "\"message\":\"Too big: expected string to have <=200 characters\"},"
        + "{\"code\":\"invalid_value\",\"values\":[\"NEW\",\"MINIGAMES\",\"BALANCE\",\"INTERFACE\",\"IMPROVEMENTS\","
        + "\"BUGS\",\"TECHNICAL\"],\"path\":[\"content\",0,\"type\"],\"message\":\"Invalid option: expected one of "
        + "\\\"NEW\\\"|\\\"MINIGAMES\\\"|\\\"BALANCE\\\"|\\\"INTERFACE\\\"|\\\"IMPROVEMENTS\\\"|\\\"BUGS\\\"|\\\"TECHNICAL\\\"\"},"
        + "{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":3,\"inclusive\":true,\"path\":[\"content\",0,"
        + "\"text\"],\"message\":\"Describe el cambio con al menos 3 caracteres.\"},"
        + "{\"expected\":\"boolean\",\"code\":\"invalid_type\",\"path\":[\"content\",0,\"highlight\"],\"message\":"
        + "\"Invalid input: expected boolean, received string\"},"
        + "{\"code\":\"unrecognized_keys\",\"keys\":[\"zz\"],\"path\":[\"content\",0],\"message\":\"Unrecognized key: "
        + "\\\"zz\\\"\"}]}", body(summaryAndHighlight));

    // superRefine de los destacados: corre aunque haya errores de longitud o claves desconocidas (no abortan), antes
    // de las claves desconocidas de la raíz; no corre si un elemento aborta (tipo o enum inválidos).
    var highlighted = "{\"type\":\"NEW\",\"text\":\"Destacado\",\"highlight\":true}";
    var four = String.join(",", highlighted, highlighted, highlighted, highlighted);
    var tooMany = support.fails(json(HttpRequest.POST("/api/admin/changelog", "{\"version\":\"1.0.0\","
        + "\"title\":\"ab\",\"summary\":1,\"date\":\"2026-11-02T10:00:00Z\",\"content\":[" + four
        + ",{\"type\":\"NEW\",\"text\":\"ab\",\"more\":1}],\"zz\":1}")), admin.cookie());
    assertEquals("{\"error\":\"Too small: expected string to have >=3 characters\",\"issues\":["
        + "{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":3,\"inclusive\":true,\"path\":[\"title\"],"
        + "\"message\":\"Too small: expected string to have >=3 characters\"},"
        + "{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"summary\"],\"message\":\"Invalid input: "
        + "expected string, received number\"},"
        + "{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":3,\"inclusive\":true,\"path\":[\"content\",4,"
        + "\"text\"],\"message\":\"Describe el cambio con al menos 3 caracteres.\"},"
        + "{\"code\":\"unrecognized_keys\",\"keys\":[\"more\"],\"path\":[\"content\",4],\"message\":\"Unrecognized "
        + "key: \\\"more\\\"\"},"
        + "{\"code\":\"custom\",\"message\":\"Marca como destacados 3 cambios como máximo.\",\"path\":[\"content\"]},"
        + "{\"code\":\"unrecognized_keys\",\"keys\":[\"zz\"],\"path\":[],\"message\":\"Unrecognized key: "
        + "\\\"zz\\\"\"}]}", body(tooMany));
    var onlyTooMany = support.fails(json(HttpRequest.PATCH("/api/admin/changelog/x", "{\"content\":[" + four + "]}")),
        admin.cookie());
    assertEquals("{\"error\":\"Marca como destacados 3 cambios como máximo.\",\"issues\":[{\"code\":\"custom\","
        + "\"message\":\"Marca como destacados 3 cambios como máximo.\",\"path\":[\"content\"]}]}", body(onlyTooMany));
    var aborted = support.fails(json(HttpRequest.PATCH("/api/admin/changelog/x", "{\"content\":[" + four
        + ",{\"type\":\"X\",\"text\":\"abc\"},{\"type\":\"NEW\",\"text\":\"abc\",\"highlight\":null}]}")),
        admin.cookie());
    assertEquals("{\"error\":\"Invalid option: expected one of \\\"NEW\\\"|\\\"MINIGAMES\\\"|\\\"BALANCE\\\"|"
        + "\\\"INTERFACE\\\"|\\\"IMPROVEMENTS\\\"|\\\"BUGS\\\"|\\\"TECHNICAL\\\"\",\"issues\":["
        + "{\"code\":\"invalid_value\",\"values\":[\"NEW\",\"MINIGAMES\",\"BALANCE\",\"INTERFACE\",\"IMPROVEMENTS\","
        + "\"BUGS\",\"TECHNICAL\"],\"path\":[\"content\",4,\"type\"],\"message\":\"Invalid option: expected one of "
        + "\\\"NEW\\\"|\\\"MINIGAMES\\\"|\\\"BALANCE\\\"|\\\"INTERFACE\\\"|\\\"IMPROVEMENTS\\\"|\\\"BUGS\\\"|\\\"TECHNICAL\\\"\"},"
        + "{\"expected\":\"boolean\",\"code\":\"invalid_type\",\"path\":[\"content\",5,\"highlight\"],\"message\":"
        + "\"Invalid input: expected boolean, received null\"}]}", body(aborted));

    var array = support.fails(json(HttpRequest.PATCH("/api/admin/changelog/x", "[]")), admin.cookie());
    assertEquals("{\"error\":\"Invalid input: expected object, received array\",\"issues\":[{\"expected\":\"object\","
        + "\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received array\"}]}",
        body(array));
    // El id se valida antes que el cuerpo.
    var longId = support.fails(json(HttpRequest.PATCH("/api/admin/changelog/" + "x".repeat(129), "[]")),
        admin.cookie());
    assertTrue(body(longId).startsWith("{\"error\":\"Too big: expected string to have <=128 characters\""),
        body(longId));
  }

  /**
   * La carrera de versiones (comprobación previa superada, INSERT rechazado por la unicidad) llega al servicio como
   * {@link ChangelogWriter.DuplicateVersionException}, que es su 409.
   */
  @Test
  void aUniqueViolationOnSaveIsAConflict() throws Exception {
    var v = version();
    var now = java.time.Instant.now();
    repository.save(ChangelogEntity.create("race-a-" + v, v, "Primera", null, now, false, List.of(Map.of("type", "NEW",
        "text", "abc")), now));
    org.junit.jupiter.api.Assertions.assertThrows(ChangelogWriter.DuplicateVersionException.class, () -> writer.insert(
        ChangelogEntity.create("race-b-" + v, v, "Segunda", null, now, false, List.of(), now)));
  }
}
