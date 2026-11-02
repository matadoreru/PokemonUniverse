package es.pokemonuniverse.application.wouldyourather;

import es.pokemonuniverse.application.errors.BadRequestException;
import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.content.WouldYouRatherPromptKey;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Dilemas personales de Would You Rather ({@code apps/server/src/would-you-rather-prompts/service.ts}). Guarda en
 * memoria las filas de todos los usuarios; cada mutación escribe primero en la BD, después actualiza la caché y por
 * último avisa a los oyentes ({@code onChanged}) con el id del usuario.
 *
 * <p>Las mutaciones de un mismo usuario van en serie, como la cadena de promesas {@code serialize} de Node: un lock
 * justo (FIFO) por usuario que se libera aunque la operación falle, así que un fallo no bloquea la siguiente. Los
 * oyentes se llaman tras soltar el lock (el coordinador toma el de la sala y vuelve a leer {@link #enabled}, que no
 * bloquea). Cada usuario tiene una lista inmutable que se sustituye con {@link ConcurrentHashMap#compute}.
 */
@Singleton
public class WouldYouRatherPromptService {

  static final String DUPLICATE = "Ya tienes una pareja igual o equivalente.";
  static final String DUPLICATE_IN_IMPORT = "El JSON contiene dilemas duplicados o invertidos.";
  static final String NOT_FOUND = "Pareja no encontrada.";

  private final WouldYouRatherPromptStore store;
  private final Clock clock;
  private final RandomSource random;
  private final Map<String, List<StoredWouldYouRatherPrompt>> byUser = new ConcurrentHashMap<>();
  private final List<Consumer<String>> listeners = new CopyOnWriteArrayList<>();
  private final Map<String, UserLock> locks = new ConcurrentHashMap<>();

  public WouldYouRatherPromptService(WouldYouRatherPromptStore store, Clock clock, RandomSource random) {
    this.store = store;
    this.clock = clock;
    this.random = random;
  }

  /** Carga en caché los dilemas de todos los usuarios (al arrancar, como Node). */
  public void load() {
    var loaded = new LinkedHashMap<String, List<StoredWouldYouRatherPrompt>>();
    for (var prompt : store.findAll()) {
      loaded.computeIfAbsent(prompt.userId(), ignored -> new ArrayList<>()).add(prompt);
    }
    byUser.clear();
    loaded.forEach((userId, prompts) -> byUser.put(userId, List.copyOf(prompts)));
  }

  /** Registra un oyente de cambios; el {@link Runnable} devuelto lo da de baja. */
  public Runnable onChanged(Consumer<String> listener) {
    listeners.add(listener);
    return () -> listeners.remove(listener);
  }

  /** Dilemas del usuario por {@code createdAt} ascendente (orden estable ante empates). */
  public List<WouldYouRatherPromptView> list(String userId) {
    return cached(userId).stream()
        .sorted(Comparator.comparing(StoredWouldYouRatherPrompt::createdAt))
        .map(WouldYouRatherPromptView::of)
        .toList();
  }

  /** Solo los activos, como {@code {id, optionA, optionB}} y en orden de inserción. */
  public List<WouldYouRatherPromptPair> enabled(String userId) {
    return cached(userId).stream()
        .filter(StoredWouldYouRatherPrompt::enabled)
        .map(prompt -> new WouldYouRatherPromptPair(prompt.id(), prompt.optionA(), prompt.optionB()))
        .toList();
  }

  public WouldYouRatherPromptView create(String userId, @Nullable JsonNode input) {
    return serialize(userId, () -> createNow(userId, input));
  }

  public List<WouldYouRatherPromptView> importPrompts(String userId, @Nullable JsonNode input) {
    return serialize(userId, () -> importNow(userId, input));
  }

  public WouldYouRatherPromptView update(String userId, String id, @Nullable JsonNode input) {
    return serialize(userId, () -> updateNow(userId, id, input));
  }

  public void delete(String userId, String id) {
    serialize(userId, () -> {
      deleteNow(userId, id);
      return null;
    });
  }

  private WouldYouRatherPromptView createNow(String userId, @Nullable JsonNode input) {
    var pair = WouldYouRatherPromptSchemas.parseCreate(input);
    assertDifferent(pair.optionA(), pair.optionB());
    var normalizedKey = WouldYouRatherPromptKey.of(pair.optionA(), pair.optionB());
    assertUnique(userId, normalizedKey, null);
    var created = insert(userId, List.of(
        new WouldYouRatherPromptStore.NewPrompt(random.uuid(), pair.optionA(), pair.optionB(), normalizedKey)));
    return WouldYouRatherPromptView.of(created.getFirst());
  }

  private List<WouldYouRatherPromptView> importNow(String userId, @Nullable JsonNode input) {
    var pairs = WouldYouRatherPromptSchemas.parseImport(input);
    var keys = pairs.stream().map(pair -> WouldYouRatherPromptKey.of(pair.optionA(), pair.optionB())).toList();
    if (new HashSet<>(keys).size() != keys.size()) throw new ConflictException(DUPLICATE_IN_IMPORT);
    for (var key : keys) assertUnique(userId, key, null);
    var rows = new ArrayList<WouldYouRatherPromptStore.NewPrompt>();
    for (int i = 0; i < pairs.size(); i++) {
      var pair = pairs.get(i);
      rows.add(new WouldYouRatherPromptStore.NewPrompt(random.uuid(), pair.optionA(), pair.optionB(), keys.get(i)));
    }
    return insert(userId, rows).stream().map(WouldYouRatherPromptView::of).toList();
  }

  /** Orden de Node: validación, existencia en caché (404), opciones distintas (400), unicidad (409) y BD. */
  private WouldYouRatherPromptView updateNow(String userId, String id, @Nullable JsonNode input) {
    var changes = WouldYouRatherPromptSchemas.parseUpdate(input);
    var current = cached(userId).stream().filter(prompt -> prompt.id().equals(id)).findFirst()
        .orElseThrow(() -> new NotFoundException(NOT_FOUND));
    var optionA = changes.optionA() == null ? current.optionA() : changes.optionA();
    var optionB = changes.optionB() == null ? current.optionB() : changes.optionB();
    assertDifferent(optionA, optionB);
    assertUnique(userId, WouldYouRatherPromptKey.of(optionA, optionB), id);
    StoredWouldYouRatherPrompt updated;
    try {
      updated = store.update(userId, id, changes.optionA(), changes.optionB(), changes.enabled(), now())
          .orElseThrow(() -> new NotFoundException(NOT_FOUND));
    } catch (WouldYouRatherPromptStore.DuplicateException e) {
      throw new ConflictException(DUPLICATE);
    } catch (WouldYouRatherPromptStore.SameOptionsException e) {
      throw new BadRequestException(WouldYouRatherPromptSchemas.SAME_OPTIONS);
    }
    byUser.compute(userId, (ignored, rows) -> rows == null ? List.of()
        : rows.stream().map(prompt -> prompt.id().equals(id) ? updated : prompt).toList());
    return WouldYouRatherPromptView.of(updated);
  }

  private void deleteNow(String userId, String id) {
    if (!store.delete(userId, id)) throw new NotFoundException(NOT_FOUND);
    byUser.compute(userId, (ignored, rows) -> rows == null ? List.of()
        : rows.stream().filter(prompt -> !prompt.id().equals(id)).toList());
  }

  private List<StoredWouldYouRatherPrompt> insert(String userId, List<WouldYouRatherPromptStore.NewPrompt> rows) {
    List<StoredWouldYouRatherPrompt> created;
    try {
      created = store.createAll(userId, rows, now());
    } catch (WouldYouRatherPromptStore.DuplicateException e) {
      throw new ConflictException(DUPLICATE);
    }
    byUser.compute(userId, (ignored, current) -> {
      var next = new ArrayList<StoredWouldYouRatherPrompt>(current == null ? List.of() : current);
      next.addAll(created);
      return List.copyOf(next);
    });
    return created;
  }

  private List<StoredWouldYouRatherPrompt> cached(String userId) {
    return byUser.getOrDefault(userId, List.of());
  }

  /** Error del servicio (no del esquema): 400 {@code {error}} sin {@code issues}, como el {@code .status} de Node. */
  private static void assertDifferent(String optionA, String optionB) {
    if (WouldYouRatherPromptKey.sameOptions(optionA, optionB)) {
      throw new BadRequestException(WouldYouRatherPromptSchemas.SAME_OPTIONS);
    }
  }

  private void assertUnique(String userId, String normalizedKey, @Nullable String ignoredId) {
    for (var prompt : cached(userId)) {
      if (!prompt.id().equals(ignoredId) && prompt.normalizedKey().equals(normalizedKey)) {
        throw new ConflictException(DUPLICATE);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ serie por usuario

  /** Lock de un usuario y cuántas operaciones lo usan; {@code users} solo cambia dentro de {@code locks.compute}. */
  private static final class UserLock {
    final ReentrantLock lock = new ReentrantLock(true);
    int users;
  }

  /** Ejecuta la mutación con el lock del usuario y avisa a los oyentes solo si terminó bien, ya sin el lock. */
  private <T> T serialize(String userId, Supplier<T> operation) {
    var entry = locks.compute(userId, (ignored, current) -> {
      var next = current == null ? new UserLock() : current;
      next.users += 1;
      return next;
    });
    T result;
    entry.lock.lock();
    try {
      result = operation.get();
    } finally {
      entry.lock.unlock();
      locks.computeIfPresent(userId, (ignored, current) -> --current.users == 0 ? null : current);
    }
    notifyChanged(userId);
    return result;
  }

  private void notifyChanged(String userId) {
    for (var listener : listeners) listener.accept(userId);
  }

  /** Postgres guarda {@code timestamp(3)}: la caché lleva la misma precisión que la fila. */
  private Instant now() {
    return Instant.ofEpochMilli(clock.now()).truncatedTo(ChronoUnit.MILLIS);
  }
}
