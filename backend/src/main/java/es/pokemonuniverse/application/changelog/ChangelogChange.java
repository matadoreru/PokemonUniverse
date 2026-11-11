package es.pokemonuniverse.application.changelog;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Un cambio de una entrada del changelog (changelogChangeSchema en shared). {@code highlight} solo vale {@code true}
 * o {@code null}: un {@code false} se normaliza a {@code null} y la clave no sale en el JSON.
 */
@Serdeable
public record ChangelogChange(
    @Schema(type = "string",
        allowableValues = {"NEW", "MINIGAMES", "BALANCE", "INTERFACE", "IMPROVEMENTS", "BUGS", "TECHNICAL"},
        requiredMode = Schema.RequiredMode.REQUIRED)
    String type,
    String text,
    @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) @Schema(nullable = false) Boolean highlight) {

  public ChangelogChange {
    if (!Boolean.TRUE.equals(highlight)) highlight = null;
  }

  public ChangelogChange(String type, String text) {
    this(type, text, null);
  }
}
