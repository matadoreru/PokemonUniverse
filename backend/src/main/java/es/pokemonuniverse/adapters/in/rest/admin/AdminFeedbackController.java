package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.orEmpty;
import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.validId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.adapters.in.rest.feedback.FeedbackItemResponse;
import es.pokemonuniverse.application.admin.AdminPage;
import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.feedback.FeedbackFilters;
import es.pokemonuniverse.application.feedback.FeedbackService;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.feedback.FeedbackReference;
import es.pokemonuniverse.domain.feedback.FeedbackStatus;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Patch;
import io.micronaut.http.annotation.PathVariable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

/**
 * {@code createAdminFeedbackRouter} de {@code feedback/routes.ts}: lista paginada con filtros más el resumen, y el
 * cambio de estado (cuerpo estricto validado antes que el id, como en Node).
 */
@Tag(name = "admin")
@Controller("/api/admin/feedback")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AdminFeedbackController {

  private static final List<String> REFERENCES = names(FeedbackReference.values());
  private static final List<String> STATUSES = names(FeedbackStatus.values());
  private static final List<String> TYPES = names(FeedbackType.values());

  private final FeedbackService service;

  public AdminFeedbackController(FeedbackService service) {
    this.service = service;
  }

  private static List<String> names(Enum<?>[] values) {
    return Arrays.stream(values).map(Enum::name).toList();
  }

  @Operation(operationId = "adminListFeedback", summary = "Feedback recibido", parameters = {
      @Parameter(name = "page", in = ParameterIn.QUERY, description = "Página (entero >= 1, por defecto 1)",
          schema = @Schema(type = "integer", format = "int64", minimum = "1", defaultValue = "1")),
      @Parameter(name = "search", in = ParameterIn.QUERY, description = "Texto recortado de hasta 80 caracteres",
          schema = @Schema(type = "string", maxLength = 80, defaultValue = "")),
      @Parameter(name = "reference", in = ParameterIn.QUERY, schema = @Schema(implementation = FeedbackReference.class)),
      @Parameter(name = "status", in = ParameterIn.QUERY, schema = @Schema(implementation = FeedbackStatus.class)),
      @Parameter(name = "type", in = ParameterIn.QUERY, schema = @Schema(implementation = FeedbackType.class))})
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = FeedbackPageResponse.class)))
  @ApiResponse(responseCode = "400", description = "Query inválida", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public FeedbackPageResponse list(@Parameter(hidden = true) HttpRequest<?> request) {
    var query = AdminQueryParams.of(request.getParameters().asMap());
    long page = query.page();
    var search = query.search();
    var reference = query.enumValue("reference", REFERENCES);
    var status = query.enumValue("status", STATUSES);
    var type = query.enumValue("type", TYPES);
    query.done();
    var filters = new FeedbackFilters(reference == null ? null : FeedbackReference.valueOf(reference),
        status == null ? null : FeedbackStatus.valueOf(status), type == null ? null : FeedbackType.valueOf(type),
        search);
    var result = service.list(filters, page);
    var overview = service.overview();
    return new FeedbackPageResponse(result.items().stream().map(FeedbackItemResponse::of).toList(), result.page(),
        AdminPage.PAGE_SIZE, result.total(), result.totalPages(), overview);
  }

  @Operation(operationId = "adminUpdateFeedbackStatus", summary = "Cambiar el estado de un feedback")
  @RequestBody(content = @Content(schema = @Schema(implementation = StatusBody.class)))
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = FeedbackResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrado", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Patch("/{id}/status")
  public FeedbackResponse updateStatus(@PathVariable String id,
      @Parameter(hidden = true) @Nullable @Body JsonNode body) {
    var status = StatusBody.parse(orEmpty(body));
    return new FeedbackResponse(FeedbackItemResponse.of(service.updateStatus(validId(id), status)));
  }

  @Serdeable
  public record FeedbackPageResponse(List<FeedbackItemResponse> items, long page, int pageSize, long total,
      long totalPages, FeedbackService.Overview overview) {}

  @Serdeable
  public record FeedbackResponse(FeedbackItemResponse feedback) {}

  /** {@code z.object({status: feedbackStatusSchema}).strict()}. */
  @Serdeable
  @Schema(name = "AdminFeedbackStatusRequest", description = "Estricto: una clave desconocida es un 400 `unrecognized_keys`.")
  public record StatusBody(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) FeedbackStatus status) {

    static FeedbackStatus parse(JsonNode body) {
      var issues = new ZodIssues();
      if (!body.isObject()) {
        issues.invalidType("object", body, List.of());
        throw new InvalidInputException(issues);
      }
      var raw = body.get("status");
      FeedbackStatus status = null;
      if (raw != null && raw.isString() && STATUSES.contains(raw.getStringValue())) {
        status = FeedbackStatus.valueOf(raw.getStringValue());
      } else {
        issues.invalidValue(STATUSES, List.of("status"));
      }
      var unknown = new java.util.ArrayList<String>();
      for (var entry : body.entries()) if (!Set.of("status").contains(entry.getKey())) unknown.add(entry.getKey());
      if (!unknown.isEmpty()) issues.unrecognizedKeys(unknown);
      if (!issues.isEmpty()) throw new InvalidInputException(issues);
      return status;
    }
  }
}
