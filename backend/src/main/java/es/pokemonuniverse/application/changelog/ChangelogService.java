package es.pokemonuniverse.application.changelog;

import es.pokemonuniverse.adapters.out.persistence.ChangelogRepository;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.List;

@Singleton
public class ChangelogService {

  private final ChangelogRepository repository;

  public ChangelogService(ChangelogRepository repository) {
    this.repository = repository;
  }

  public record Entry(String id, String version, String title, Instant date, boolean published,
      List<ChangelogChange> content, Instant createdAt, Instant updatedAt) {}

  public List<Entry> listPublished() {
    return repository.findByPublishedTrueOrderByDateDescAndCreatedAtDesc().stream()
        .map(e -> new Entry(e.getId(), e.getVersion(), e.getTitle(), e.getDate(), e.isPublished(),
            ChangelogContent.parse(e.getContent()), e.getCreatedAt(), e.getUpdatedAt()))
        .toList();
  }
}
