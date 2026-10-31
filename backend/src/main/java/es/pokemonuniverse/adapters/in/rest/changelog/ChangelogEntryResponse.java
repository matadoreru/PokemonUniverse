package es.pokemonuniverse.adapters.in.rest.changelog;

import es.pokemonuniverse.application.changelog.ChangelogChange;
import es.pokemonuniverse.application.changelog.ChangelogService;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

@Serdeable
public record ChangelogEntryResponse(String id, String version, String title, String date,
    boolean published, List<ChangelogChange> content, String createdAt, String updatedAt) {

  static ChangelogEntryResponse of(ChangelogService.Entry e) {
    return new ChangelogEntryResponse(e.id(), e.version(), e.title(), IsoTimestamps.millis(e.date()),
        e.published(), e.content(), IsoTimestamps.millis(e.createdAt()),
        IsoTimestamps.millis(e.updatedAt()));
  }
}
