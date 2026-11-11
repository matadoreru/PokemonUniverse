package es.pokemonuniverse.adapters.in.rest.changelog;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.changelog.ChangelogChange;
import es.pokemonuniverse.application.changelog.ChangelogService;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/** {@code summary} no sale si la versión no tiene resumen ({@code summary?: string} en shared). */
@Serdeable
public record ChangelogEntryResponse(String id, String version, String title,
    @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) @Schema(nullable = false) String summary,
    String date, boolean published,
    List<ChangelogChange> content, String createdAt, String updatedAt) {

  public static ChangelogEntryResponse of(ChangelogService.Entry e) {
    return new ChangelogEntryResponse(e.id(), e.version(), e.title(), e.summary(), IsoTimestamps.millis(e.date()),
        e.published(), e.content(), IsoTimestamps.millis(e.createdAt()),
        IsoTimestamps.millis(e.updatedAt()));
  }
}
