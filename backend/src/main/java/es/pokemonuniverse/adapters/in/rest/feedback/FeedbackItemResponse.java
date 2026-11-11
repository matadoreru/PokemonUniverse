package es.pokemonuniverse.adapters.in.rest.feedback;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.feedback.FeedbackService;
import es.pokemonuniverse.domain.feedback.FeedbackReference;
import es.pokemonuniverse.domain.feedback.FeedbackStatus;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Vista pública de un feedback; los nulos se emiten explícitos, como hace Node. Los textos enumerados documentan
 * en el OpenAPI su enum (el {@code name()} que se emite).
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record FeedbackItemResponse(
    String id,
    @Schema(implementation = FeedbackReference.class, requiredMode = Schema.RequiredMode.REQUIRED) String reference,
    @Nullable String gameId,
    @Nullable String gameName,
    @Nullable String roomCode,
    @Schema(implementation = FeedbackType.class, requiredMode = Schema.RequiredMode.REQUIRED) String type,
    @Schema(implementation = FeedbackStatus.class, requiredMode = Schema.RequiredMode.REQUIRED) String status,
    String description,
    Author author,
    String createdAt,
    String updatedAt) {

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record Author(@Nullable String userId, String displayName,
      @Schema(implementation = AuthUser.Kind.class, requiredMode = Schema.RequiredMode.REQUIRED) String kind) {}

  public static FeedbackItemResponse of(FeedbackService.Submitted submitted) {
    var f = submitted.feedback();
    return new FeedbackItemResponse(f.getId(), f.getReference().name(), f.getGameId(), submitted.gameName(),
        f.getRoomCode(), f.getType().name(), f.getStatus().name(), f.getDescription(),
        new Author(f.getAuthorUserId(), f.getAuthorDisplayName(), f.getAuthorKind()),
        IsoTimestamps.millis(f.getCreatedAt()), IsoTimestamps.millis(f.getUpdatedAt()));
  }
}
