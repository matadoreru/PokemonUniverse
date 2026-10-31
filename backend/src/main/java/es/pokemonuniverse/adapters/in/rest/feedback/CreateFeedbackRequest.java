package es.pokemonuniverse.adapters.in.rest.feedback;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.domain.feedback.FeedbackReference;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import es.pokemonuniverse.application.feedback.SubmitFeedbackCommand;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Cuerpo estricto: una clave desconocida falla la deserialización (como {@code .strict()} de Zod). */
@JsonIgnoreProperties(ignoreUnknown = false)
@Serdeable
public record CreateFeedbackRequest(
    @Nullable FeedbackReference reference,
    @Size(min = 1, max = 64, message = "Selecciona un minijuego.") @Nullable String gameId,
    @Pattern(regexp = "^[A-Z2-9]{6}$", message = "El código de sala no es válido.") @Nullable String roomCode,
    @NotNull(message = "Selecciona el tipo de feedback.") @Nullable FeedbackType type,
    @NotNull(message = "Describe el feedback con al menos 10 caracteres.")
        @Size(min = 10, message = "Describe el feedback con al menos 10 caracteres.")
        @Size(max = 2000, message = "El feedback no puede superar los 2.000 caracteres.")
        @Nullable String description) {

  /** Mismo preprocesado que Zod: {@code trim} y mayúsculas en el código de sala. */
  public CreateFeedbackRequest normalized() {
    return new CreateFeedbackRequest(reference, gameId == null ? null : gameId.trim(),
        roomCode == null ? null : roomCode.trim().toUpperCase(Locale.ROOT), type,
        description == null ? null : description.trim());
  }

  public FeedbackReference effectiveReference() {
    if (reference != null) return reference;
    return gameId != null ? FeedbackReference.MINIGAME : FeedbackReference.GENERAL;
  }

  /** Reglas entre campos (sobre el cuerpo ya validado campo a campo). */
  public List<ApiError.Issue> crossFieldIssues() {
    var issues = new ArrayList<ApiError.Issue>();
    var effective = effectiveReference();
    if (effective == FeedbackReference.MINIGAME && gameId == null) {
      issues.add(new ApiError.Issue("gameId", "Selecciona un minijuego."));
    }
    if (effective != FeedbackReference.MINIGAME && gameId != null) {
      issues.add(new ApiError.Issue("gameId", "El minijuego solo se incluye cuando el feedback hace referencia a uno."));
    }
    return issues;
  }

  public SubmitFeedbackCommand toCommand() {
    return new SubmitFeedbackCommand(effectiveReference(), gameId, roomCode, type, description);
  }
}
