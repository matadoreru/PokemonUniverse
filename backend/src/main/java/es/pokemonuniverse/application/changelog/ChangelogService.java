package es.pokemonuniverse.application.changelog;

import es.pokemonuniverse.adapters.out.persistence.ChangelogEntity;
import es.pokemonuniverse.adapters.out.persistence.ChangelogRepository;
import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.json.tree.JsonNode;
import jakarta.inject.Singleton;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * {@code ChangelogService} de {@code changelog/service.ts}: lista pública y CRUD de administración. La versión es única:
 * se comprueba antes de escribir (409 antes que 404 en la edición, como Node) y la carrera la resuelve la unicidad de
 * la BD ({@code 23505}, P2002), que también responde 409.
 */
@Singleton
public class ChangelogService {

  static final String DUPLICATE_VERSION = "Ya existe una entrada con esta versión.";
  static final String NOT_FOUND = "Versión no encontrada.";
  private static final String UNIQUE_VIOLATION = "23505";

  private final ChangelogRepository repository;
  private final Clock clock;

  public ChangelogService(ChangelogRepository repository, Clock clock) {
    this.repository = repository;
    this.clock = clock;
  }

  public record Entry(String id, String version, String title, Instant date, boolean published,
      List<ChangelogChange> content, Instant createdAt, Instant updatedAt) {}

  public List<Entry> listPublished() {
    return repository.findByPublishedTrueOrderByDateDescAndCreatedAtDesc().stream().map(ChangelogService::view).toList();
  }

  public List<Entry> listAll() {
    return repository.listAll().stream().map(ChangelogService::view).toList();
  }

  public Entry create(JsonNode body) {
    var input = ChangelogInput.parseCreate(body);
    if (repository.findByVersion(input.version()).isPresent()) throw new ConflictException(DUPLICATE_VERSION);
    var now = Instant.ofEpochMilli(clock.now());
    var entity = ChangelogEntity.create(UUID.randomUUID().toString(), input.version(), input.title(), input.date(),
        input.published(), stored(input.content()), now);
    try {
      return view(repository.save(entity));
    } catch (RuntimeException e) {
      if (isUniqueViolation(e)) throw new ConflictException(DUPLICATE_VERSION);
      throw e;
    }
  }

  public Entry update(String id, JsonNode body) {
    var input = ChangelogInput.parseUpdate(body);
    if (input.version() != null) {
      var duplicate = repository.findByVersion(input.version());
      if (duplicate.isPresent() && !duplicate.get().getId().equals(id)) throw new ConflictException(DUPLICATE_VERSION);
    }
    var entity = repository.findById(id).orElseThrow(() -> new NotFoundException(NOT_FOUND));
    entity.update(input.version(), input.title(), input.date(), input.published(),
        input.content() == null ? null : stored(input.content()), Instant.ofEpochMilli(clock.now()));
    try {
      return view(repository.update(entity));
    } catch (RuntimeException e) {
      if (isUniqueViolation(e)) throw new ConflictException(DUPLICATE_VERSION);
      throw e;
    }
  }

  public void delete(String id) {
    if (repository.deleteEntry(id) == 0) throw new NotFoundException(NOT_FOUND);
  }

  private static Entry view(ChangelogEntity e) {
    return new Entry(e.getId(), e.getVersion(), e.getTitle(), e.getDate(), e.isPublished(),
        ChangelogContent.parse(e.getContent()), e.getCreatedAt(), e.getUpdatedAt());
  }

  /** {@code content} como lo guarda Prisma: objetos {@code {type, text}} con el texto ya recortado. */
  private static List<Object> stored(List<ChangelogChange> content) {
    return content.stream().<Object>map(change -> {
      var item = new LinkedHashMap<String, Object>();
      item.put("type", change.type());
      item.put("text", change.text());
      return item;
    }).toList();
  }

  /** {@code 23505} en la cadena de causas (P2002 de Prisma). */
  public static boolean isUniqueViolation(Throwable error) {
    for (Throwable cause = error; cause != null && cause.getCause() != cause; cause = cause.getCause()) {
      if (cause instanceof SQLException sql && UNIQUE_VIOLATION.equals(sql.getSQLState())) return true;
      if (cause instanceof org.hibernate.JDBCException jdbc && UNIQUE_VIOLATION.equals(jdbc.getSQLState())) return true;
    }
    return false;
  }
}
