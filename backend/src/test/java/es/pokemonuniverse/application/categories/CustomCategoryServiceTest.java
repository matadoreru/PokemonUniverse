package es.pokemonuniverse.application.categories;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/** Escenarios de {@code apps/server/src/categories/service.test.ts} y los literales del inventario §3. */
class CustomCategoryServiceTest {

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();

  /** {@code MemoryRepository} del test de Node; puede simular la unicidad de la BD. */
  static final class MemoryStore implements CustomCategoryStore {
    final List<StoredCustomCategory> rows = new ArrayList<>();
    boolean enforceUnique = true;

    @Override
    public List<StoredCustomCategory> findAll() {
      return List.copyOf(rows);
    }

    @Override
    public StoredCustomCategory create(String id, String userId, String text, String normalizedText, Instant now) {
      if (enforceUnique && rows.stream().anyMatch(r -> r.userId().equals(userId) && r.normalizedText().equals(normalizedText))) {
        throw new DuplicateException(null);
      }
      var row = new StoredCustomCategory(id, userId, text, normalizedText, true, now, now);
      rows.add(row);
      return row;
    }

    @Override
    public Optional<StoredCustomCategory> update(String userId, String id, @Nullable String text,
        @Nullable String normalizedText, @Nullable Boolean enabled, Instant now) {
      for (int i = 0; i < rows.size(); i++) {
        var r = rows.get(i);
        if (!r.id().equals(id) || !r.userId().equals(userId)) continue;
        var updated = new StoredCustomCategory(id, userId, text == null ? r.text() : text,
            normalizedText == null ? r.normalizedText() : normalizedText, enabled == null ? r.enabled() : enabled,
            r.createdAt(), now);
        rows.set(i, updated);
        return Optional.of(updated);
      }
      return Optional.empty();
    }

    @Override
    public boolean delete(String userId, String id) {
      return rows.removeIf(r -> r.userId().equals(userId) && r.id().equals(id));
    }
  }

  static final class Ids implements RandomSource {
    private final AtomicInteger next = new AtomicInteger(1);

    @Override
    public double next() {
      return 0;
    }

    @Override
    public String uuid() {
      return "c" + next.getAndIncrement();
    }

    @Override
    public int nextInt(int bound) {
      return 0;
    }
  }

  private final MemoryStore store = new MemoryStore();
  private final AtomicLong millis = new AtomicLong(1_000);
  private final CustomCategoryService service = service();

  private CustomCategoryService service() {
    var created = new CustomCategoryService(store, () -> millis.getAndAdd(1_000), new Ids());
    created.load();
    return created;
  }

  private static JsonNode json(String text) {
    try {
      return MAPPER.readValue(text, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static String serialize(Object value) {
    try {
      return MAPPER.writeValueAsString(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Mensaje y {@code issues} exactos de Zod (salida de {@code safeParse} en Node). */
  private static void assertIssues(String message, String issuesJson, Runnable operation) {
    var e = assertThrows(InvalidInputException.class, operation::run);
    assertEquals(message, e.getMessage());
    assertEquals(issuesJson, serialize(e.issues()));
  }

  @Test
  void createsTrimmedAndViewsInNodeShape() {
    var view = service.create("u1", json("{\"text\":\"\\u00a0  Pokémon para el gimnasio \\u2028\"}"));
    assertEquals("Pokémon para el gimnasio", view.text());
    assertEquals("{\"id\":\"c1\",\"text\":\"Pokémon para el gimnasio\",\"enabled\":true,"
        + "\"createdAt\":\"1970-01-01T00:00:01.000Z\",\"updatedAt\":\"1970-01-01T00:00:01.000Z\"}", serialize(view));
    assertEquals("pokemon para el gimnasio", store.rows.getFirst().normalizedText());
  }

  @Test
  void createsEditsTogglesAndDeletesOnlyOwnCategories() {
    var created = service.create("u1", json("{\"text\":\"Pokémon para el gimnasio\"}"));
    assertEquals(List.of(new SubjectiveCategory(created.id(), "Pokémon para el gimnasio")), service.enabled("u1"));
    var edited = service.update("u1", created.id(), json("{\"text\":\"Pokémon para hacer deporte\",\"enabled\":false}"));
    assertEquals("Pokémon para hacer deporte", edited.text());
    assertEquals(false, edited.enabled());
    assertEquals(List.of(), service.enabled("u1"));
    var foreign = assertThrows(NotFoundException.class,
        () -> service.update("u2", created.id(), json("{\"enabled\":true}")));
    assertEquals("Categoría no encontrada.", foreign.getMessage());
    assertEquals("Categoría no encontrada.",
        assertThrows(NotFoundException.class, () -> service.delete("u2", created.id())).getMessage());
    service.delete("u1", created.id());
    assertEquals(List.of(), service.list("u1"));
  }

  @Test
  void rejectsEquivalentDuplicatesAndSurvivesReload() {
    service.create("u1", json("{\"text\":\"Pikachú\"}"));
    var duplicate = assertThrows(ConflictException.class, () -> service.create("u1", json("{\"text\":\"pikachu\"}")));
    assertEquals("Ya tienes una categoría igual o equivalente.", duplicate.getMessage());
    assertEquals(1, store.rows.size());
    // Otro usuario puede tener la misma.
    service.create("u2", json("{\"text\":\"pikachu\"}"));
    var restarted = service();
    assertEquals(1, restarted.list("u1").size());
    assertEquals("Pikachú", restarted.enabled("u1").getFirst().text());
  }

  @Test
  void duplicateOnUpdateChecksCacheBeforeOwnership() {
    var first = service.create("u1", json("{\"text\":\"Pokémon para una CITA\"}"));
    var second = service.create("u1", json("{\"text\":\"Pokémon para cocinar\"}"));
    assertEquals("Ya tienes una categoría igual o equivalente.", assertThrows(ConflictException.class,
        () -> service.update("u1", second.id(), json("{\"text\":\"pokemon para una cita!\"}"))).getMessage());
    // Renombrarse a sí misma con la misma clave no es duplicado.
    assertEquals("POKEMON para una cita", service.update("u1", first.id(),
        json("{\"text\":\"POKEMON para una cita\"}")).text());
    // Node comprueba la caché antes de la propiedad: un id ajeno con texto duplicado da 409, no 404.
    assertThrows(ConflictException.class, () -> service.update("u1", "ajena", json("{\"text\":\"Pokémon para cocinar\"}")));
  }

  @Test
  void databaseUniqueViolationIsTheSameConflict() {
    store.rows.add(new StoredCustomCategory("x", "u1", "Pikachu", "pikachu", true, Instant.EPOCH, Instant.EPOCH));
    // La caché no conoce la fila: responde la unicidad de la BD.
    var e = assertThrows(ConflictException.class, () -> service.create("u1", json("{\"text\":\"Pikachú\"}")));
    assertEquals("Ya tienes una categoría igual o equivalente.", e.getMessage());
    assertEquals(List.of(), service.list("u1"));
  }

  @Test
  void validatesCreateLikeZod() {
    // Semántica Zod del servicio para null (undefined); por HTTP no se alcanza: el controlador pasa {} sin cuerpo.
    assertIssues("Invalid input: expected object, received undefined",
        "[{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received undefined\"}]",
        () -> service.create("u1", null));
    assertIssues("Invalid input: expected object, received array",
        "[{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received array\"}]",
        () -> service.create("u1", json("[]")));
    assertIssues("Invalid input: expected string, received undefined",
        "[{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"text\"],\"message\":\"Invalid input: expected string, received undefined\"}]",
        () -> service.create("u1", json("{}")));
    assertIssues("Invalid input: expected string, received number",
        "[{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"text\"],\"message\":\"Invalid input: expected string, received number\"}]",
        () -> service.create("u1", json("{\"text\":1}")));
    assertIssues("Escribe al menos 4 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"text\"],\"message\":\"Escribe al menos 4 caracteres.\"}]",
        () -> service.create("u1", json("{\"text\":\"  abc  \"}")));
    assertIssues("La categoría no puede superar 160 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":160,\"inclusive\":true,\"path\":[\"text\"],\"message\":\"La categoría no puede superar 160 caracteres.\"}]",
        () -> service.create("u1", json("{\"text\":\"" + "a".repeat(161) + "\"}")));
    assertEquals("a".repeat(160), service.create("u1", json("{\"text\":\" " + "a".repeat(160) + " \"}")).text());
    assertIssues("Unrecognized keys: \"foo\", \"bar\"",
        "[{\"code\":\"unrecognized_keys\",\"keys\":[\"foo\",\"bar\"],\"path\":[],\"message\":\"Unrecognized keys: \\\"foo\\\", \\\"bar\\\"\"}]",
        () -> service.create("u1", json("{\"text\":\"abcd\",\"foo\":1,\"bar\":2}")));
    assertIssues("Escribe al menos 4 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"text\"],\"message\":\"Escribe al menos 4 caracteres.\"},"
            + "{\"code\":\"unrecognized_keys\",\"keys\":[\"foo\"],\"path\":[],\"message\":\"Unrecognized key: \\\"foo\\\"\"}]",
        () -> service.create("u1", json("{\"text\":\"ab\",\"foo\":1}")));
  }

  @Test
  void validatesUpdateLikeZod() {
    var id = service.create("u1", json("{\"text\":\"Pokémon para cocinar\"}")).id();
    assertIssues("No hay cambios que guardar.",
        "[{\"code\":\"custom\",\"path\":[],\"message\":\"No hay cambios que guardar.\"}]",
        () -> service.update("u1", id, json("{}")));
    assertIssues("Unrecognized key: \"foo\"",
        "[{\"code\":\"unrecognized_keys\",\"keys\":[\"foo\"],\"path\":[],\"message\":\"Unrecognized key: \\\"foo\\\"\"},"
            + "{\"code\":\"custom\",\"path\":[],\"message\":\"No hay cambios que guardar.\"}]",
        () -> service.update("u1", id, json("{\"foo\":1}")));
    assertIssues("Invalid input: expected boolean, received null",
        "[{\"expected\":\"boolean\",\"code\":\"invalid_type\",\"path\":[\"enabled\"],\"message\":\"Invalid input: expected boolean, received null\"}]",
        () -> service.update("u1", id, json("{\"enabled\":null}")));
    assertIssues("Escribe al menos 4 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"text\"],\"message\":\"Escribe al menos 4 caracteres.\"},"
            + "{\"expected\":\"boolean\",\"code\":\"invalid_type\",\"path\":[\"enabled\"],\"message\":\"Invalid input: expected boolean, received number\"},"
            + "{\"code\":\"unrecognized_keys\",\"keys\":[\"zz\"],\"path\":[],\"message\":\"Unrecognized key: \\\"zz\\\"\"}]",
        () -> service.update("u1", id, json("{\"text\":\"ab\",\"enabled\":3,\"zz\":1}")));
    // La validación va antes que la existencia.
    assertThrows(InvalidInputException.class, () -> service.update("u1", "nope", json("{}")));
  }

  @Test
  void enabledKeepsInsertionOrderAndListSortsByCreation() {
    var a = service.create("u1", json("{\"text\":\"Primera categoría\"}"));
    var b = service.create("u1", json("{\"text\":\"Segunda categoría\"}"));
    var c = service.create("u1", json("{\"text\":\"Tercera categoría\"}"));
    service.update("u1", b.id(), json("{\"enabled\":false}"));
    assertEquals(List.of(a.id(), c.id()), service.enabled("u1").stream().map(SubjectiveCategory::id).toList());
    assertEquals(List.of(a.id(), b.id(), c.id()), service.list("u1").stream().map(CustomCategoryView::id).toList());
    // Tras recargar, el orden de inserción es el de la lectura de la BD.
    store.rows.add(0, store.rows.remove(2));
    var restarted = service();
    assertEquals(List.of(c.id(), a.id()), restarted.enabled("u1").stream().map(SubjectiveCategory::id).toList());
    assertEquals(List.of(a.id(), b.id(), c.id()), restarted.list("u1").stream().map(CustomCategoryView::id).toList());
  }

  @Test
  void notifiesAfterEveryMutationWithTheCacheAlreadyUpdated() {
    var changed = new ArrayList<String>();
    var seen = new ArrayList<Integer>();
    var unsubscribe = service.onChanged(userId -> {
      changed.add(userId);
      seen.add(service.enabled(userId).size());
    });
    var category = service.create("u1", json("{\"text\":\"Pokémon para cocinar\"}"));
    service.update("u1", category.id(), json("{\"enabled\":false}"));
    service.update("u1", category.id(), json("{\"enabled\":true}"));
    service.delete("u1", category.id());
    assertEquals(List.of("u1", "u1", "u1", "u1"), changed);
    assertEquals(List.of(1, 0, 1, 0), seen);
    // Las mutaciones rechazadas no avisan.
    assertThrows(NotFoundException.class, () -> service.delete("u1", category.id()));
    assertThrows(InvalidInputException.class, () -> service.create("u1", json("{}")));
    assertEquals(4, changed.size());
    unsubscribe.run();
    service.create("u1", json("{\"text\":\"Pokémon para dormir\"}"));
    assertEquals(4, changed.size());
    assertTrue(service.list("u9").isEmpty());
  }
}
