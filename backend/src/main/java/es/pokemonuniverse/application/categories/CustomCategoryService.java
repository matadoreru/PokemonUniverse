package es.pokemonuniverse.application.categories;

import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.content.ContentNormalizer;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Categorías personalizadas ({@code apps/server/src/categories/service.ts}). Guarda en memoria las filas de todos los
 * usuarios; cada mutación escribe primero en la BD, después actualiza la caché y por último avisa a los oyentes
 * ({@code onChanged}) con el id del usuario.
 *
 * <p>Node es monohilo; aquí cada usuario tiene una lista inmutable que se sustituye con
 * {@link ConcurrentHashMap#compute}, y los oyentes se llaman fuera de cualquier bloqueo del servicio (el coordinador
 * toma el lock de la sala y desde él vuelve a leer {@link #enabled}). Como en Node, entre la comprobación de duplicados
 * en caché y la escritura hay una ventana: la unicidad de la BD la respalda con el mismo 409.
 */
@Singleton
public class CustomCategoryService {

  static final String DUPLICATE = "Ya tienes una categoría igual o equivalente.";
  static final String NOT_FOUND = "Categoría no encontrada.";
  static final String TOO_SHORT = "Escribe al menos 4 caracteres.";
  static final String TOO_LONG = "La categoría no puede superar 160 caracteres.";
  static final String NO_CHANGES = "No hay cambios que guardar.";
  private static final int MIN_TEXT = 4;
  private static final int MAX_TEXT = 160;

  private final CustomCategoryStore store;
  private final Clock clock;
  private final RandomSource random;
  private final Map<String, List<StoredCustomCategory>> byUser = new ConcurrentHashMap<>();
  private final List<Consumer<String>> listeners = new CopyOnWriteArrayList<>();

  public CustomCategoryService(CustomCategoryStore store, Clock clock, RandomSource random) {
    this.store = store;
    this.clock = clock;
    this.random = random;
  }

  /** Carga en caché las categorías de todos los usuarios (al arrancar, como Node). */
  public void load() {
    var loaded = new LinkedHashMap<String, List<StoredCustomCategory>>();
    for (var category : store.findAll()) {
      loaded.computeIfAbsent(category.userId(), ignored -> new ArrayList<>()).add(category);
    }
    byUser.clear();
    loaded.forEach((userId, categories) -> byUser.put(userId, List.copyOf(categories)));
  }

  /** Registra un oyente de cambios; el {@link Runnable} devuelto lo da de baja. */
  public Runnable onChanged(Consumer<String> listener) {
    listeners.add(listener);
    return () -> listeners.remove(listener);
  }

  /** Categorías del usuario por {@code createdAt} ascendente (orden estable ante empates). */
  public List<CustomCategoryView> list(String userId) {
    return cached(userId).stream()
        .sorted(Comparator.comparing(StoredCustomCategory::createdAt))
        .map(CustomCategoryView::of)
        .toList();
  }

  /** Solo las activas, como {@code {id, text}} y en orden de inserción. */
  public List<SubjectiveCategory> enabled(String userId) {
    return cached(userId).stream()
        .filter(StoredCustomCategory::enabled)
        .map(category -> new SubjectiveCategory(category.id(), category.text()))
        .toList();
  }

  public CustomCategoryView create(String userId, @Nullable JsonNode input) {
    var text = parseCreate(input);
    var normalizedText = ContentNormalizer.normalize(text);
    assertUnique(userId, normalizedText, null);
    StoredCustomCategory created;
    try {
      created = store.create(random.uuid(), userId, text, normalizedText, now());
    } catch (CustomCategoryStore.DuplicateException e) {
      throw new ConflictException(DUPLICATE);
    }
    byUser.compute(userId, (ignored, current) -> append(current, created));
    notifyChanged(userId);
    return CustomCategoryView.of(created);
  }

  public CustomCategoryView update(String userId, String id, @Nullable JsonNode input) {
    var changes = parseUpdate(input);
    var normalizedText = changes.text() == null ? null : ContentNormalizer.normalize(changes.text());
    if (normalizedText != null) assertUnique(userId, normalizedText, id);
    StoredCustomCategory updated;
    try {
      updated = store.update(userId, id, changes.text(), normalizedText, changes.enabled(), now())
          .orElseThrow(() -> new NotFoundException(NOT_FOUND));
    } catch (CustomCategoryStore.DuplicateException e) {
      throw new ConflictException(DUPLICATE);
    }
    byUser.compute(userId, (ignored, current) -> current == null ? List.of()
        : current.stream().map(category -> category.id().equals(id) ? updated : category).toList());
    notifyChanged(userId);
    return CustomCategoryView.of(updated);
  }

  public void delete(String userId, String id) {
    if (!store.delete(userId, id)) throw new NotFoundException(NOT_FOUND);
    byUser.compute(userId, (ignored, current) -> current == null ? List.of()
        : current.stream().filter(category -> !category.id().equals(id)).toList());
    notifyChanged(userId);
  }

  private List<StoredCustomCategory> cached(String userId) {
    return byUser.getOrDefault(userId, List.of());
  }

  private void assertUnique(String userId, String normalizedText, @Nullable String ignoredId) {
    for (var category : cached(userId)) {
      if (!category.id().equals(ignoredId) && category.normalizedText().equals(normalizedText)) {
        throw new ConflictException(DUPLICATE);
      }
    }
  }

  private static List<StoredCustomCategory> append(@Nullable List<StoredCustomCategory> current,
      StoredCustomCategory category) {
    var next = new ArrayList<StoredCustomCategory>(current == null ? List.of() : current);
    next.add(category);
    return List.copyOf(next);
  }

  private void notifyChanged(String userId) {
    for (var listener : listeners) listener.accept(userId);
  }

  /** Postgres guarda {@code timestamp(3)}: la caché lleva la misma precisión que la fila. */
  private Instant now() {
    return Instant.ofEpochMilli(clock.now()).truncatedTo(ChronoUnit.MILLIS);
  }

  // ------------------------------------------------------------------------------------------ esquemas Zod

  /** {@code createCustomCategorySchema}: {@code z.object({text}).strict()}. */
  private static String parseCreate(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.invalidType("object", raw, List.of());
      throw new InvalidInputException(issues);
    }
    var text = text(raw.get("text"), issues);
    unrecognizedKeys(raw, Set.of("text"), issues);
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return text;
  }

  private record Changes(@Nullable String text, @Nullable Boolean enabled) {}

  /** {@code updateCustomCategorySchema}: {@code {text?, enabled?}} estricto y con al menos un campo. */
  private static Changes parseUpdate(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.invalidType("object", raw, List.of());
      throw new InvalidInputException(issues);
    }
    var textNode = raw.get("text");
    var text = textNode == null ? null : text(textNode, issues);
    var enabledNode = raw.get("enabled");
    Boolean enabled = null;
    if (enabledNode != null) {
      if (enabledNode.isBoolean()) enabled = enabledNode.getBooleanValue();
      else issues.invalidType("boolean", enabledNode, List.of("enabled"));
    }
    unrecognizedKeys(raw, Set.of("text", "enabled"), issues);
    // El refine solo falla sin ninguno de los dos campos; en ese caso no puede haber incidencias de campo.
    if (textNode == null && enabledNode == null) issues.custom(List.of(), NO_CHANGES);
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return new Changes(text, enabled);
  }

  /** {@code customCategoryTextSchema}: {@code trim} de JS y longitud 4..160 en unidades UTF-16. */
  private static @Nullable String text(@Nullable JsonNode node, ZodIssues issues) {
    if (node == null || !node.isString()) {
      issues.invalidType("string", node, List.of("text"));
      return null;
    }
    var trimmed = JsStrings.trim(node.getStringValue());
    if (trimmed.length() < MIN_TEXT) {
      issues.tooSmall("string", MIN_TEXT, List.of("text"), TOO_SHORT);
    } else if (trimmed.length() > MAX_TEXT) {
      issues.tooBig("string", MAX_TEXT, List.of("text"), TOO_LONG);
    }
    return trimmed;
  }

  private static void unrecognizedKeys(JsonNode raw, Set<String> allowed, ZodIssues issues) {
    var unknown = new ArrayList<String>();
    for (var entry : raw.entries()) if (!allowed.contains(entry.getKey())) unknown.add(entry.getKey());
    if (!unknown.isEmpty()) issues.unrecognizedKeys(unknown);
  }
}
