package es.pokemonuniverse.application.wouldyourather;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.errors.BadRequestException;
import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.content.WouldYouRatherPromptKey;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

/**
 * Escenarios de {@code apps/server/src/would-you-rather-prompts/service.test.ts} y los literales del inventario §3.
 * Las incidencias esperadas son la salida de {@code safeParse} de los esquemas de {@code packages/shared} en Node.
 */
class WouldYouRatherPromptServiceTest {

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();

  /** {@code MemoryRepository} del test de Node; simula la unicidad de la BD y la atomicidad del lote. */
  static final class MemoryStore implements WouldYouRatherPromptStore {
    final List<StoredWouldYouRatherPrompt> rows = new ArrayList<>();
    /** Se ejecuta dentro de cada escritura (antes de tocar las filas). */
    Runnable beforeWrite = () -> {};

    @Override
    public synchronized List<StoredWouldYouRatherPrompt> findAll() {
      return List.copyOf(rows);
    }

    @Override
    public List<StoredWouldYouRatherPrompt> createAll(String userId, List<NewPrompt> prompts, Instant now) {
      beforeWrite.run();
      return createLocked(userId, prompts, now);
    }

    private synchronized List<StoredWouldYouRatherPrompt> createLocked(String userId, List<NewPrompt> prompts, Instant now) {
      var created = new ArrayList<StoredWouldYouRatherPrompt>();
      for (var p : prompts) {
        if (rows.stream().anyMatch(r -> r.userId().equals(userId) && r.normalizedKey().equals(p.normalizedKey()))
            || created.stream().anyMatch(r -> r.normalizedKey().equals(p.normalizedKey()))) {
          throw new DuplicateException(null);
        }
        created.add(new StoredWouldYouRatherPrompt(p.id(), userId, p.optionA(), p.optionB(), p.normalizedKey(), true,
            now, now));
      }
      rows.addAll(created);
      return List.copyOf(created);
    }

    @Override
    public Optional<StoredWouldYouRatherPrompt> update(String userId, String id, @Nullable String optionA,
        @Nullable String optionB, @Nullable Boolean enabled, Instant now) {
      beforeWrite.run();
      return updateLocked(userId, id, optionA, optionB, enabled, now);
    }

    private synchronized Optional<StoredWouldYouRatherPrompt> updateLocked(String userId, String id,
        @Nullable String optionA, @Nullable String optionB, @Nullable Boolean enabled, Instant now) {
      for (int i = 0; i < rows.size(); i++) {
        var r = rows.get(i);
        if (!r.id().equals(id) || !r.userId().equals(userId)) continue;
        var a = optionA == null ? r.optionA() : optionA;
        var b = optionB == null ? r.optionB() : optionB;
        if (WouldYouRatherPromptKey.sameOptions(a, b)) throw new SameOptionsException();
        var key = WouldYouRatherPromptKey.of(a, b);
        if (rows.stream().anyMatch(o -> !o.id().equals(id) && o.userId().equals(userId) && o.normalizedKey().equals(key))) {
          throw new DuplicateException(null);
        }
        var updated = new StoredWouldYouRatherPrompt(id, userId, a, b, key, enabled == null ? r.enabled() : enabled,
            r.createdAt(), now);
        rows.set(i, updated);
        return Optional.of(updated);
      }
      return Optional.empty();
    }

    @Override
    public boolean delete(String userId, String id) {
      beforeWrite.run();
      synchronized (this) {
        return rows.removeIf(r -> r.userId().equals(userId) && r.id().equals(id));
      }
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
      return "w" + next.getAndIncrement();
    }

    @Override
    public int nextInt(int bound) {
      return 0;
    }
  }

  private final MemoryStore store = new MemoryStore();
  private final AtomicLong millis = new AtomicLong(1_000);
  private final WouldYouRatherPromptService service = service();

  private WouldYouRatherPromptService service() {
    var created = new WouldYouRatherPromptService(store, () -> millis.getAndAdd(1_000), new Ids());
    created.load();
    return created;
  }

  static JsonNode json(String text) {
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

  private static JsonNode pair(String optionA, String optionB) {
    return json("{\"optionA\":" + serialize(optionA) + ",\"optionB\":" + serialize(optionB) + "}");
  }

  private static String importBody(int count) {
    return "{\"version\":1,\"prompts\":[" + IntStream.range(0, count)
        .mapToObj(i -> "{\"optionA\":\"Opción A " + i + "\",\"optionB\":\"Opción B " + i + "\"}")
        .collect(Collectors.joining(",")) + "]}";
  }

  /** Mensaje y {@code issues} exactos de Zod (salida de {@code safeParse} en Node). */
  private static void assertIssues(String message, String issuesJson, Runnable operation) {
    var e = assertThrows(InvalidInputException.class, operation::run);
    assertEquals(message, e.getMessage());
    assertEquals(issuesJson, serialize(e.issues()));
  }

  private static final String SAME = "[{\"code\":\"custom\",\"path\":[\"optionB\"],\"message\":\"Las dos opciones deben ser diferentes.\"}]";

  // ------------------------------------------------------------------------------------------ Node service.test.ts

  @Test
  void createsEditsTogglesAndDeletesOnlyOwnPrompts() {
    var created = service.create("u1", pair("Vivir con Gengar", "Viajar con Magikarp"));
    assertEquals(List.of(new WouldYouRatherPromptPair(created.id(), "Vivir con Gengar", "Viajar con Magikarp")),
        service.enabled("u1"));
    var edited = service.update("u1", created.id(), json("{\"optionA\":\"Cenar con Gengar\",\"enabled\":false}"));
    assertEquals("Cenar con Gengar", edited.optionA());
    assertEquals("Viajar con Magikarp", edited.optionB());
    assertFalse(edited.enabled());
    assertEquals(WouldYouRatherPromptKey.of("Cenar con Gengar", "Viajar con Magikarp"), store.rows.getFirst().normalizedKey());
    var foreign = assertThrows(NotFoundException.class, () -> service.update("u2", created.id(), json("{\"enabled\":true}")));
    assertEquals("Pareja no encontrada.", foreign.getMessage());
    assertEquals("Pareja no encontrada.",
        assertThrows(NotFoundException.class, () -> service.delete("u2", created.id())).getMessage());
    service.delete("u1", created.id());
    assertEquals(List.of(), service.list("u1"));
  }

  @Test
  void viewHasNodeShapeAndTrimmedOptions() {
    var view = service.create("u1", pair("  Vivir con Gengar  ", " Viajar con Magikarp "));
    assertEquals("{\"id\":\"w1\",\"optionA\":\"Vivir con Gengar\",\"optionB\":\"Viajar con Magikarp\",\"enabled\":true,"
        + "\"createdAt\":\"1970-01-01T00:00:01.000Z\",\"updatedAt\":\"1970-01-01T00:00:01.000Z\"}", serialize(view));
    assertEquals("viajar con magikarp::vivir con gengar", store.rows.getFirst().normalizedKey());
  }

  @Test
  void rejectsEqualOptionsAndEquivalentDuplicatePairsIncludingReversed() {
    // Iguales por comparación base de Intl ('es'): es el refine del esquema, con incidencias y ruta ['optionB'].
    assertIssues("Las dos opciones deben ser diferentes.", SAME, () -> service.create("u1", pair("Pikachu", "pikachú")));
    assertIssues("Las dos opciones deben ser diferentes.", SAME, () -> service.create("u1", pair("  Pikachu ", "PIKACHU")));
    // Distintas para Intl pero iguales normalizadas: es el error del servicio, sin incidencias.
    var normalized = assertThrows(BadRequestException.class,
        () -> service.create("u1", pair("La misma opción", "la misma opcion!")));
    assertEquals("Las dos opciones deben ser diferentes.", normalized.getMessage());
    service.create("u1", pair("Vivir con Gengar", "Viajar con Magikarp"));
    var reversed = assertThrows(ConflictException.class,
        () -> service.create("u1", pair("viajar con magikarp!", "VIVIR CON GENGAR")));
    assertEquals("Ya tienes una pareja igual o equivalente.", reversed.getMessage());
    assertEquals(1, store.rows.size());
    // Otro usuario puede tener la misma pareja.
    service.create("u2", pair("Viajar con Magikarp", "Vivir con Gengar"));
  }

  @Test
  void persistsThroughReloadAndNotifiesAfterEveryMutation() {
    var changed = new ArrayList<String>();
    var seen = new ArrayList<Integer>();
    var unsubscribe = service.onChanged(userId -> {
      changed.add(userId);
      seen.add(service.enabled(userId).size());
    });
    var prompt = service.create("u1", pair("Elegir a Pikachu", "Elegir a Eevee"));
    service.update("u1", prompt.id(), json("{\"enabled\":false}"));
    service.delete("u1", prompt.id());
    service.importPrompts("u1", json(importBody(2)));
    assertEquals(List.of("u1", "u1", "u1", "u1"), changed);
    assertEquals(List.of(1, 0, 0, 2), seen);
    // Las mutaciones rechazadas no avisan.
    assertThrows(NotFoundException.class, () -> service.delete("u1", prompt.id()));
    assertThrows(InvalidInputException.class, () -> service.create("u1", json("{}")));
    assertThrows(ConflictException.class, () -> service.importPrompts("u1", json(importBody(1))));
    assertEquals(4, changed.size());
    unsubscribe.run();
    service.create("u1", pair("Dormir con Snorlax", "Correr con Rapidash"));
    assertEquals(4, changed.size());
    var restarted = service();
    assertEquals(3, restarted.list("u1").size());
    assertTrue(restarted.list("u9").isEmpty());
  }

  @Test
  void importsAVersionedBatchAndRejectsDuplicatesBeforeWriting() {
    var imported = service.importPrompts("u1", json("{\"version\":1,\"prompts\":["
        + "{\"optionA\":\"Entrenar con Pikachu\",\"optionB\":\"Dormir con Snorlax\"},"
        + "{\"optionA\":\" Volar con Dragonite \",\"optionB\":\"Nadar con Lapras\"}]}"));
    assertEquals(List.of("Entrenar con Pikachu", "Volar con Dragonite"),
        imported.stream().map(WouldYouRatherPromptView::optionA).toList());
    assertEquals(2, service.enabled("u1").size());
    var internal = assertThrows(ConflictException.class, () -> service.importPrompts("u1", json("{\"version\":1,\"prompts\":["
        + "{\"optionA\":\"Elegir a Eevee\",\"optionB\":\"Elegir a Mew\"},"
        + "{\"optionA\":\"elegir a mew\",\"optionB\":\"ELEGIR A EEVEE\"}]}")));
    assertEquals("El JSON contiene dilemas duplicados o invertidos.", internal.getMessage());
    var existing = assertThrows(ConflictException.class, () -> service.importPrompts("u1", json("{\"version\":1,\"prompts\":["
        + "{\"optionA\":\"Elegir a Eevee\",\"optionB\":\"Elegir a Mew\"},"
        + "{\"optionA\":\"nadar con lapras\",\"optionB\":\"VOLAR con Dragonite\"}]}")));
    assertEquals("Ya tienes una pareja igual o equivalente.", existing.getMessage());
    assertEquals(2, store.rows.size());
    // Node no comprueba la igualdad normalizada en la importación: solo el refine del esquema.
    var lax = service.importPrompts("u1", json("{\"version\":1,\"prompts\":[{\"optionA\":\"Pikachu!\",\"optionB\":\"pikachu\"}]}"));
    assertEquals(1, lax.size());
    assertEquals("pikachu::pikachu", store.rows.getLast().normalizedKey());
  }

  @Test
  void importIsAllOrNothingAgainstTheDatabase() {
    // Fila que la caché no conoce: la unicidad del lote la detecta la BD y no se escribe nada.
    store.rows.add(new StoredWouldYouRatherPrompt("x", "u1", "Opción A 1", "Opción B 1",
        WouldYouRatherPromptKey.of("Opción A 1", "Opción B 1"), true, Instant.EPOCH, Instant.EPOCH));
    var e = assertThrows(ConflictException.class, () -> service.importPrompts("u1", json(importBody(3))));
    assertEquals("Ya tienes una pareja igual o equivalente.", e.getMessage());
    assertEquals(1, store.rows.size());
    assertEquals(List.of(), service.list("u1"));
  }

  @Test
  void failedBatchDoesNotTouchTheCacheOrNotify() {
    var notifications = new AtomicInteger();
    service.onChanged(userId -> notifications.incrementAndGet());
    store.beforeWrite = () -> {
      throw new IllegalStateException("Transaction failed");
    };
    var e = assertThrows(IllegalStateException.class, () -> service.importPrompts("u1", json(importBody(1))));
    assertEquals("Transaction failed", e.getMessage());
    assertEquals(List.of(), service.list("u1"));
    assertEquals(0, notifications.get());
  }

  @Test
  void importLimitsAndIssuesLikeZod() {
    assertIssues("Incluye al menos un dilema.",
        "[{\"origin\":\"array\",\"code\":\"too_small\",\"minimum\":1,\"inclusive\":true,\"path\":[\"prompts\"],\"message\":\"Incluye al menos un dilema.\"}]",
        () -> service.importPrompts("u1", json(importBody(0))));
    assertIssues("Puedes importar hasta 100 dilemas cada vez.",
        "[{\"origin\":\"array\",\"code\":\"too_big\",\"maximum\":100,\"inclusive\":true,\"path\":[\"prompts\"],\"message\":\"Puedes importar hasta 100 dilemas cada vez.\"}]",
        () -> service.importPrompts("u1", json(importBody(101))));
    assertEquals(100, service.importPrompts("u1", json(importBody(100))).size());
    // Fuera de rango de longitud, Zod no informa de los elementos (sí de version y de las claves de la raíz).
    var tooManyBroken = importBody(101).replace("{\"optionA\":\"Opción A 0\",\"optionB\":\"Opción B 0\"}", "1");
    assertIssues("Invalid input: expected 1",
        "[{\"code\":\"invalid_value\",\"values\":[1],\"path\":[\"version\"],\"message\":\"Invalid input: expected 1\"},"
            + "{\"origin\":\"array\",\"code\":\"too_big\",\"maximum\":100,\"inclusive\":true,\"path\":[\"prompts\"],\"message\":\"Puedes importar hasta 100 dilemas cada vez.\"},"
            + "{\"code\":\"unrecognized_keys\",\"keys\":[\"foo\"],\"path\":[],\"message\":\"Unrecognized key: \\\"foo\\\"\"}]",
        () -> service.importPrompts("u1", json(tooManyBroken.replace("\"version\":1", "\"version\":7,\"foo\":1"))));
    assertIssues("Las dos opciones deben ser diferentes.",
        "[{\"code\":\"custom\",\"path\":[\"prompts\",1,\"optionB\"],\"message\":\"Las dos opciones deben ser diferentes.\"}]",
        () -> service.importPrompts("u1", json("{\"version\":1,\"prompts\":[{\"optionA\":\"Opción A 0\",\"optionB\":\"Opción B 0\"},"
            + "{\"optionA\":\"Pikachu\",\"optionB\":\"pikachú\"}]}")));
    assertIssues("Escribe al menos 4 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"prompts\",1,\"optionA\"],\"message\":\"Escribe al menos 4 caracteres.\"},"
            + "{\"code\":\"unrecognized_keys\",\"keys\":[\"extra\"],\"path\":[\"prompts\",1],\"message\":\"Unrecognized key: \\\"extra\\\"\"},"
            + "{\"code\":\"unrecognized_keys\",\"keys\":[\"foo\"],\"path\":[],\"message\":\"Unrecognized key: \\\"foo\\\"\"}]",
        () -> service.importPrompts("u1", json("{\"version\":1,\"prompts\":[{\"optionA\":\"Opción A 0\",\"optionB\":\"Opción B 0\"},"
            + "{\"optionA\":\"abc\",\"optionB\":\"Opción larga\",\"extra\":true}],\"foo\":1}")));
    assertIssues("Unrecognized key: \"z\"",
        "[{\"code\":\"unrecognized_keys\",\"keys\":[\"z\"],\"path\":[\"prompts\",0],\"message\":\"Unrecognized key: \\\"z\\\"\"},"
            + "{\"code\":\"custom\",\"path\":[\"prompts\",0,\"optionB\"],\"message\":\"Las dos opciones deben ser diferentes.\"}]",
        () -> service.importPrompts("u1", json("{\"version\":1,\"prompts\":[{\"optionA\":\"Pikachu\",\"optionB\":\"pikachú\",\"z\":1}]}")));
    assertIssues("Invalid input: expected object, received number",
        "[{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[\"prompts\",0],\"message\":\"Invalid input: expected object, received number\"},"
            + "{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[\"prompts\",1],\"message\":\"Invalid input: expected object, received null\"}]",
        () -> service.importPrompts("u1", json("{\"version\":1,\"prompts\":[1,null]}")));
    assertIssues("Invalid input: expected string, received number",
        "[{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"prompts\",1,\"optionA\"],\"message\":\"Invalid input: expected string, received number\"}]",
        () -> service.importPrompts("u1", json("{\"version\":1,\"prompts\":[{\"optionA\":\"Opción A 0\",\"optionB\":\"Opción B 0\"},"
            + "{\"optionA\":1,\"optionB\":\"abcd\"}]}")));
    assertIssues("Invalid input: expected 1",
        "[{\"code\":\"invalid_value\",\"values\":[1],\"path\":[\"version\"],\"message\":\"Invalid input: expected 1\"},"
            + "{\"expected\":\"array\",\"code\":\"invalid_type\",\"path\":[\"prompts\"],\"message\":\"Invalid input: expected array, received undefined\"}]",
        () -> service.importPrompts("u1", json("{}")));
    assertIssues("Invalid input: expected 1",
        "[{\"code\":\"invalid_value\",\"values\":[1],\"path\":[\"version\"],\"message\":\"Invalid input: expected 1\"},"
            + "{\"expected\":\"array\",\"code\":\"invalid_type\",\"path\":[\"prompts\"],\"message\":\"Invalid input: expected array, received null\"}]",
        () -> service.importPrompts("u1", json("{\"version\":null,\"prompts\":null}")));
    assertIssues("Invalid input: expected 1",
        "[{\"code\":\"invalid_value\",\"values\":[1],\"path\":[\"version\"],\"message\":\"Invalid input: expected 1\"},"
            + "{\"origin\":\"array\",\"code\":\"too_small\",\"minimum\":1,\"inclusive\":true,\"path\":[\"prompts\"],\"message\":\"Incluye al menos un dilema.\"}]",
        () -> service.importPrompts("u1", json("{\"version\":\"1\",\"prompts\":[]}")));
    assertIssues("Invalid input: expected array, received string",
        "[{\"expected\":\"array\",\"code\":\"invalid_type\",\"path\":[\"prompts\"],\"message\":\"Invalid input: expected array, received string\"}]",
        () -> service.importPrompts("u1", json("{\"version\":1.0,\"prompts\":\"x\"}")));
    assertIssues("Invalid input: expected object, received array",
        "[{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received array\"}]",
        () -> service.importPrompts("u1", json("[]")));
    assertEquals(100, service.list("u1").size());
  }

  @Test
  void validatesCreateLikeZod() {
    assertIssues("Escribe al menos 4 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"optionA\"],\"message\":\"Escribe al menos 4 caracteres.\"},"
            + "{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"optionB\"],\"message\":\"Escribe al menos 4 caracteres.\"},"
            + "{\"code\":\"custom\",\"path\":[\"optionB\"],\"message\":\"Las dos opciones deben ser diferentes.\"}]",
        () -> service.create("u1", pair("abc", "abc")));
    assertIssues("La opción no puede superar 180 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":180,\"inclusive\":true,\"path\":[\"optionA\"],\"message\":\"La opción no puede superar 180 caracteres.\"},"
            + "{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":180,\"inclusive\":true,\"path\":[\"optionB\"],\"message\":\"La opción no puede superar 180 caracteres.\"},"
            + "{\"code\":\"custom\",\"path\":[\"optionB\"],\"message\":\"Las dos opciones deben ser diferentes.\"}]",
        () -> service.create("u1", pair("a".repeat(181), "A".repeat(181))));
    assertIssues("La opción no puede superar 180 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":180,\"inclusive\":true,\"path\":[\"optionA\"],\"message\":\"La opción no puede superar 180 caracteres.\"},"
            + "{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"optionB\"],\"message\":\"Escribe al menos 4 caracteres.\"}]",
        () -> service.create("u1", pair("a".repeat(181), "b")));
    assertIssues("Unrecognized key: \"foo\"",
        "[{\"code\":\"unrecognized_keys\",\"keys\":[\"foo\"],\"path\":[],\"message\":\"Unrecognized key: \\\"foo\\\"\"},"
            + "{\"code\":\"custom\",\"path\":[\"optionB\"],\"message\":\"Las dos opciones deben ser diferentes.\"}]",
        () -> service.create("u1", json("{\"optionA\":\"Pikachu\",\"optionB\":\"pikachú\",\"foo\":1}")));
    assertIssues("Invalid input: expected string, received number",
        "[{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"optionA\"],\"message\":\"Invalid input: expected string, received number\"}]",
        () -> service.create("u1", json("{\"optionA\":1,\"optionB\":\"abcd\"}")));
    assertIssues("Invalid input: expected string, received null",
        "[{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"optionB\"],\"message\":\"Invalid input: expected string, received null\"}]",
        () -> service.create("u1", json("{\"optionA\":\"abcd\",\"optionB\":null}")));
    assertIssues("Invalid input: expected string, received undefined",
        "[{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"optionA\"],\"message\":\"Invalid input: expected string, received undefined\"},"
            + "{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"optionB\"],\"message\":\"Invalid input: expected string, received undefined\"}]",
        () -> service.create("u1", json("{}")));
    assertIssues("Invalid input: expected object, received array",
        "[{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received array\"}]",
        () -> service.create("u1", json("[]")));
    assertIssues("Invalid input: expected object, received undefined",
        "[{\"expected\":\"object\",\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received undefined\"}]",
        () -> service.create("u1", null));
    // Equivalencia canónica: é precompuesta frente a e + acento combinante.
    assertIssues("Las dos opciones deben ser diferentes.", SAME, () -> service.create("u1", pair("Café latte", "Café latte")));
    assertEquals(0, store.rows.size());
  }

  @Test
  void validatesUpdateLikeZodThenOwnershipThenDistinctThenUnique() {
    var id = service.create("u1", pair("Primera opción", "Segunda opción")).id();
    service.create("u1", pair("Tercera opción", "Cuarta opción"));
    assertIssues("No hay cambios que guardar.", "[{\"code\":\"custom\",\"path\":[],\"message\":\"No hay cambios que guardar.\"}]",
        () -> service.update("u1", id, json("{}")));
    assertIssues("Unrecognized key: \"foo\"",
        "[{\"code\":\"unrecognized_keys\",\"keys\":[\"foo\"],\"path\":[],\"message\":\"Unrecognized key: \\\"foo\\\"\"},"
            + "{\"code\":\"custom\",\"path\":[],\"message\":\"No hay cambios que guardar.\"}]",
        () -> service.update("u1", id, json("{\"foo\":1}")));
    assertIssues("Escribe al menos 4 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":4,\"inclusive\":true,\"path\":[\"optionA\"],\"message\":\"Escribe al menos 4 caracteres.\"},"
            + "{\"expected\":\"boolean\",\"code\":\"invalid_type\",\"path\":[\"enabled\"],\"message\":\"Invalid input: expected boolean, received null\"},"
            + "{\"code\":\"unrecognized_keys\",\"keys\":[\"zz\"],\"path\":[],\"message\":\"Unrecognized key: \\\"zz\\\"\"}]",
        () -> service.update("u1", id, json("{\"optionA\":\"ab\",\"enabled\":null,\"zz\":1}")));
    assertIssues("La opción no puede superar 180 caracteres.",
        "[{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":180,\"inclusive\":true,\"path\":[\"optionB\"],\"message\":\"La opción no puede superar 180 caracteres.\"}]",
        () -> service.update("u1", id, json("{\"optionB\":\"" + "x".repeat(181) + "\"}")));
    // La validación va antes que la existencia; la existencia (caché) antes que la unicidad, al revés que categorías.
    assertThrows(InvalidInputException.class, () -> service.update("u1", "nope", json("{}")));
    assertThrows(NotFoundException.class, () -> service.update("u1", "nope", json("{\"optionA\":\"Cuarta opción\",\"optionB\":\"Tercera opción\"}")));
    // El esquema de edición no tiene refine: la igualdad la detecta el servicio, sin incidencias.
    var same = assertThrows(BadRequestException.class,
        () -> service.update("u1", id, json("{\"optionA\":\"Pikachu\",\"optionB\":\"pikachú\"}")));
    assertEquals("Las dos opciones deben ser diferentes.", same.getMessage());
    assertThrows(BadRequestException.class, () -> service.update("u1", id, json("{\"optionB\":\"PRIMERA opcion\"}")));
    var duplicate = assertThrows(ConflictException.class,
        () -> service.update("u1", id, json("{\"optionA\":\"cuarta opcion\",\"optionB\":\"Tercera Opción\"}")));
    assertEquals("Ya tienes una pareja igual o equivalente.", duplicate.getMessage());
    // Reordenar la propia pareja no es duplicado.
    assertEquals("Segunda opción", service.update("u1", id,
        json("{\"optionA\":\"Segunda opción\",\"optionB\":\"Primera opción\"}")).optionA());
  }

  @Test
  void storeLevelConflictsKeepTheirLiterals() {
    var id = service.create("u1", pair("Primera opción", "Segunda opción")).id();
    // Fila que la caché no conoce: el 409 lo da la BD.
    store.rows.add(new StoredWouldYouRatherPrompt("x", "u1", "Tercera opción", "Cuarta opción",
        WouldYouRatherPromptKey.of("Tercera opción", "Cuarta opción"), true, Instant.EPOCH, Instant.EPOCH));
    assertEquals("Ya tienes una pareja igual o equivalente.", assertThrows(ConflictException.class,
        () -> service.update("u1", id, json("{\"optionA\":\"Tercera opción\",\"optionB\":\"Cuarta opción\"}"))).getMessage());
    // Otro proceso cambió la opción B: la fusión dentro de la transacción deja ambas iguales.
    var current = store.rows.getFirst();
    store.rows.set(0, new StoredWouldYouRatherPrompt(current.id(), "u1", current.optionA(), "Quinta opción",
        WouldYouRatherPromptKey.of(current.optionA(), "Quinta opción"), true, current.createdAt(), current.updatedAt()));
    assertEquals("Las dos opciones deben ser diferentes.", assertThrows(BadRequestException.class,
        () -> service.update("u1", id, json("{\"optionA\":\"quinta opcion\"}"))).getMessage());
    // La fila desapareció entre la caché y la transacción: 404.
    store.rows.removeFirst();
    assertThrows(NotFoundException.class, () -> service.update("u1", id, json("{\"enabled\":false}")));
  }

  @Test
  void enabledKeepsInsertionOrderAndListSortsByCreation() {
    var a = service.create("u1", pair("Primera opción", "Segunda opción"));
    var b = service.create("u1", pair("Tercera opción", "Cuarta opción"));
    var c = service.create("u1", pair("Quinta opción", "Sexta opción"));
    service.update("u1", b.id(), json("{\"enabled\":false}"));
    assertEquals(List.of(a.id(), c.id()), service.enabled("u1").stream().map(WouldYouRatherPromptPair::id).toList());
    assertEquals(List.of(a.id(), b.id(), c.id()), service.list("u1").stream().map(WouldYouRatherPromptView::id).toList());
    store.rows.add(0, store.rows.remove(2));
    var restarted = service();
    assertEquals(List.of(c.id(), a.id()), restarted.enabled("u1").stream().map(WouldYouRatherPromptPair::id).toList());
    assertEquals(List.of(a.id(), b.id(), c.id()), restarted.list("u1").stream().map(WouldYouRatherPromptView::id).toList());
  }

  // ------------------------------------------------------------------------------------------ serialización por usuario

  /** Lanza las operaciones a la vez en hilos virtuales y devuelve sus resultados (o la excepción). */
  private static List<Object> together(List<Supplier<Object>> operations) throws Exception {
    var start = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = operations.stream().map(op -> executor.submit(() -> {
        start.await();
        try {
          return op.get();
        } catch (RuntimeException e) {
          return e;
        }
      })).toList();
      start.countDown();
      var results = new ArrayList<Object>();
      for (var future : futures) results.add(future.get(10, TimeUnit.SECONDS));
      return results;
    }
  }

  @Test
  void serializesEditsOfBothOptionsAndKeepsTheNormalizedPairCoherent() throws Exception {
    var id = service.create("u1", pair("Primera opción", "Segunda opción")).id();
    var active = new AtomicInteger();
    var overlapped = new AtomicInteger();
    store.beforeWrite = () -> {
      if (active.incrementAndGet() > 1) overlapped.incrementAndGet();
      try {
        Thread.sleep(20);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
      active.decrementAndGet();
    };
    together(List.of(
        () -> service.update("u1", id, json("{\"optionA\":\"Tercera opción\"}")),
        () -> service.update("u1", id, json("{\"optionB\":\"Cuarta opción\"}"))));
    assertEquals(0, overlapped.get());
    var stored = store.rows.getFirst();
    assertEquals(WouldYouRatherPromptKey.of(stored.optionA(), stored.optionB()), stored.normalizedKey());
    var listed = service.list("u1").getFirst();
    assertEquals("Tercera opción", listed.optionA());
    assertEquals("Cuarta opción", listed.optionB());
  }

  @Test
  void concurrentEditsConvergingOnOnePairGiveOneSuccessAndOneConflict() throws Exception {
    var first = service.create("u1", pair("Primera opción", "Segunda opción")).id();
    var second = service.create("u1", pair("Tercera opción", "Cuarta opción")).id();
    var results = together(List.of(
        () -> service.update("u1", first, json("{\"optionA\":\"Vivir con Gengar\",\"optionB\":\"Viajar con Magikarp\"}")),
        () -> service.update("u1", second, json("{\"optionA\":\"viajar con magikarp\",\"optionB\":\"VIVIR con Gengar\"}"))));
    assertEquals(1, results.stream().filter(WouldYouRatherPromptView.class::isInstance).count());
    var conflicts = results.stream().filter(ConflictException.class::isInstance).map(r -> ((ConflictException) r).getMessage()).toList();
    assertEquals(List.of("Ya tienes una pareja igual o equivalente."), conflicts);
    var key = WouldYouRatherPromptKey.of("Vivir con Gengar", "Viajar con Magikarp");
    assertEquals(1, store.rows.stream().filter(r -> r.normalizedKey().equals(key)).count());
  }

  @Test
  void aFailedMutationDoesNotBlockTheNextOne() throws Exception {
    var id = service.create("u1", pair("Primera opción", "Segunda opción")).id();
    store.beforeWrite = () -> {
      throw new IllegalStateException("BD caída");
    };
    assertThrows(IllegalStateException.class, () -> service.update("u1", id, json("{\"enabled\":false}")));
    store.beforeWrite = () -> {};
    var results = together(List.of(() -> service.update("u1", id, json("{\"enabled\":false}"))));
    assertFalse(((WouldYouRatherPromptView) results.getFirst()).enabled());
  }

  @Test
  void otherUsersAreNotSerializedBehindASlowUser() throws Exception {
    var slow = new CountDownLatch(1);
    var entered = new CountDownLatch(1);
    store.beforeWrite = () -> {
      if (Thread.currentThread().getName().equals("lento")) {
        entered.countDown();
        try {
          slow.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
      }
    };
    var blocked = Thread.ofVirtual().name("lento").start(() -> service.create("u1", pair("Primera opción", "Segunda opción")));
    assertTrue(entered.await(5, TimeUnit.SECONDS));
    // Mientras u1 sigue dentro de su escritura, u2 escribe y la caché se lee sin esperar.
    var done = new CountDownLatch(1);
    Thread.ofVirtual().start(() -> {
      service.create("u2", pair("Primera opción", "Segunda opción"));
      service.list("u1");
      done.countDown();
    });
    assertTrue(done.await(5, TimeUnit.SECONDS));
    assertEquals(1, service.list("u2").size());
    slow.countDown();
    blocked.join();
    assertEquals(1, service.list("u1").size());
  }

  // ------------------------------------------------------------------------------------------ comparación base de Intl

  @Test
  void baseComparisonMatchesIntlCollatorForSpanish() {
    // Valores de `a.localeCompare(b, 'es', {sensitivity: 'base'})` en Node (0 ⇔ iguales).
    assertTrue(WouldYouRatherPromptSchemas.sameBase("Pikachu", "pikachú"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("Æon", "aeon"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("straße", "strasse"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("Ch", "ch"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("ﬁre", "fire"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("Ⅻ", "xii"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("Café", "Café"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("ØRE", "ore"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("Đ", "d"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase(" x", " x"));
    assertTrue(WouldYouRatherPromptSchemas.sameBase("１２", "12"));
    assertFalse(WouldYouRatherPromptSchemas.sameBase("ñandu", "nandu"));
    assertFalse(WouldYouRatherPromptSchemas.sameBase("Pikachu!", "pikachu"));
    assertFalse(WouldYouRatherPromptSchemas.sameBase("PIKACHU ", "pikachu"));
    assertFalse(WouldYouRatherPromptSchemas.sameBase("ı", "i"));
    assertFalse(WouldYouRatherPromptSchemas.sameBase("ll", "l"));
  }

  @Test
  void keyIsTheSortedPairOfNormalizedOptions() {
    assertEquals("viajar con magikarp::vivir con gengar", WouldYouRatherPromptKey.of("Vivir con Gengar!", "VIAJAR con Magikarp"));
    assertEquals("viajar con magikarp::vivir con gengar", WouldYouRatherPromptKey.of("viajar con magikarp", "vivir con gengar"));
    assertTrue(WouldYouRatherPromptKey.sameOptions("La misma opción", "la misma opcion!"));
    assertFalse(WouldYouRatherPromptKey.sameOptions("ñandu", "pikachu"));
  }
}
