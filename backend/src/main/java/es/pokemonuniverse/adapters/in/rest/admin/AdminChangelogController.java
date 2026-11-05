package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.orEmpty;
import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.validId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.adapters.in.rest.changelog.ChangelogEntryResponse;
import es.pokemonuniverse.application.changelog.ChangelogChange;
import es.pokemonuniverse.application.changelog.ChangelogService;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Delete;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Patch;
import io.micronaut.http.annotation.PathVariable;
import io.micronaut.http.annotation.Post;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

/**
 * {@code createAdminChangelogRouter} de {@code changelog/routes.ts}, bajo la puerta de {@link AdminGate}. El cuerpo
 * llega como árbol JSON y lo valida {@code ChangelogInput} con los esquemas Zod portados; en la edición, el id se
 * valida antes que el cuerpo, como en Node.
 */
@Tag(name = "admin")
@Controller("/api/admin/changelog")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AdminChangelogController {

  private final ChangelogService service;

  public AdminChangelogController(ChangelogService service) {
    this.service = service;
  }

  @Operation(operationId = "adminListChangelog", summary = "Todas las entradas del changelog, publicadas o no")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = EntriesResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public EntriesResponse list() {
    return new EntriesResponse(service.listAll().stream().map(ChangelogEntryResponse::of).toList());
  }

  @Operation(operationId = "adminCreateChangelog", summary = "Crear una entrada del changelog")
  @RequestBody(content = @Content(schema = @Schema(implementation = CreateChangelogBody.class)))
  @ApiResponse(responseCode = "201", description = "Creada", content = @Content(schema = @Schema(implementation = EntryResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Versión duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post
  public HttpResponse<EntryResponse> create(@Parameter(hidden = true) @Nullable @Body JsonNode body) {
    return HttpResponse.created(new EntryResponse(ChangelogEntryResponse.of(service.create(orEmpty(body)))));
  }

  @Operation(operationId = "adminUpdateChangelog", summary = "Editar una entrada del changelog")
  @RequestBody(content = @Content(schema = @Schema(implementation = UpdateChangelogBody.class)))
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = EntryResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Versión duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Patch("/{id}")
  public EntryResponse update(@PathVariable String id, @Parameter(hidden = true) @Nullable @Body JsonNode body) {
    var valid = validId(id);
    return new EntryResponse(ChangelogEntryResponse.of(service.update(valid, orEmpty(body))));
  }

  @Operation(operationId = "adminDeleteChangelog", summary = "Borrar una entrada del changelog")
  @ApiResponse(responseCode = "204", description = "Sin contenido")
  @ApiResponse(responseCode = "400", description = "Id demasiado largo", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Delete("/{id}")
  public HttpResponse<Void> delete(@PathVariable String id) {
    service.delete(validId(id));
    return HttpResponse.noContent();
  }

  @Serdeable
  public record EntriesResponse(List<ChangelogEntryResponse> entries) {}

  @Serdeable
  public record EntryResponse(ChangelogEntryResponse entry) {}

  /** Solo documenta el cuerpo (estricto: una clave desconocida es un 400 {@code unrecognized_keys}). */
  @Serdeable
  @Schema(name = "AdminCreateChangelogRequest", description = "Estricto: una clave desconocida es un 400 `unrecognized_keys`.")
  public record CreateChangelogBody(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, pattern = "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$") String version,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 3, maxLength = 120) String title,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, maxLength = 200,
          description = "Recortado; vacío = sin resumen.") String summary,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "date-time") String date,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, defaultValue = "false") Boolean published,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Como máximo 3 con `highlight: true`.")
      List<ChangelogChange> content) {}

  /**
   * Solo documenta el cuerpo: todos los campos opcionales, pero {@code published} conserva su valor por defecto
   * ({@code false}) y se aplica aunque no se envíe, como en Node.
   */
  @Serdeable
  @Schema(name = "AdminUpdateChangelogRequest", description = "Estricto. Si se omite `published`, la entrada queda"
      + " despublicada (`published` vale `false` por defecto también al editar).")
  public record UpdateChangelogBody(
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED) String version,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, minLength = 3, maxLength = 120) String title,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, maxLength = 200,
          description = "Recortado; vacío borra el resumen.") String summary,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, format = "date-time") String date,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, defaultValue = "false") Boolean published,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, description = "Como máximo 3 con `highlight: true`.")
      List<ChangelogChange> content) {}
}
