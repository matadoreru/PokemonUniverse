package es.pokemonuniverse.adapters.in.rest.feedback;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.in.rest.ApiValidationException;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.feedback.FeedbackService;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import java.util.Optional;

/** El límite de 10 peticiones / 15 min por IP lo aplica el filtro de la tarea 12 sobre esta ruta. */
@Tag(name = "feedback")
@Controller("/api/feedback")
@ExecuteOn(TaskExecutors.BLOCKING)
public class FeedbackController {

  private final FeedbackService service;
  private final Validator validator;

  public FeedbackController(FeedbackService service, Validator validator) {
    this.service = service;
    this.validator = validator;
  }

  @Operation(summary = "Enviar feedback")
  @ApiResponse(responseCode = "201", description = "Creado")
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "401", description = "Sesión requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post
  public HttpResponse<FeedbackResponse> submit(@Body CreateFeedbackRequest body, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var author = current.orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required"));
    var request = body.normalized();
    var violations = validator.validate(request);
    if (!violations.isEmpty()) throw new ConstraintViolationException(violations);
    var issues = request.crossFieldIssues();
    if (!issues.isEmpty()) throw new ApiValidationException(issues);
    var submitted = service.submit(author, request.toCommand());
    return HttpResponse.created(new FeedbackResponse(FeedbackItemResponse.of(submitted)));
  }

  @Serdeable
  public record FeedbackResponse(FeedbackItemResponse feedback) {}
}
