package es.pokemonuniverse.adapters.in.rest.wouldyourather;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.orEmpty;
import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.registeredUserId;
import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.validId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptService;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptView;
import es.pokemonuniverse.domain.identity.AuthUser;
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
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Optional;

/**
 * {@code apps/server/src/would-you-rather-prompts/routes.ts}: todas las rutas exigen cuenta registrada
 * ({@code requireUser}). El cuerpo llega como árbol JSON y lo valida el servicio con los esquemas Zod portados.
 *
 * <p>Un 400 puede tener dos formas, como en Node: el de un esquema Zod lleva {@code issues}; el de opciones iguales
 * tras normalizar lo lanza el servicio y es solo {@code {error}}.
 */
@Tag(name = "would-you-rather-prompts")
@Controller("/api/would-you-rather-prompts")
@ExecuteOn(TaskExecutors.BLOCKING)
public class WouldYouRatherPromptController {

  private final WouldYouRatherPromptService service;

  public WouldYouRatherPromptController(WouldYouRatherPromptService service) {
    this.service = service;
  }

  @Operation(operationId = "listWouldYouRatherPrompts", summary = "Listar mis dilemas de Would You Rather")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = PromptsResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public PromptsResponse list(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    return new PromptsResponse(service.list(registeredUserId(current)));
  }

  @Operation(operationId = "createWouldYouRatherPrompt", summary = "Crear un dilema de Would You Rather")
  @RequestBody(content = @Content(schema = @Schema(implementation = CreatePromptBody.class)))
  @ApiResponse(responseCode = "201", description = "Creado", content = @Content(schema = @Schema(implementation = PromptResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos u opciones iguales tras normalizar",
      content = @Content(schema = @Schema(oneOf = {ValidationErrorResponse.class, ApiError.class})))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Pareja duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post
  public HttpResponse<PromptResponse> create(@Parameter(hidden = true) @Nullable @Body JsonNode body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    return HttpResponse.created(new PromptResponse(service.create(userId, orEmpty(body))));
  }

  @Operation(operationId = "importWouldYouRatherPrompts", summary = "Importar dilemas desde JSON (todo o nada)")
  @RequestBody(content = @Content(schema = @Schema(implementation = ImportPromptsBody.class)))
  @ApiResponse(responseCode = "201", description = "Importados", content = @Content(schema = @Schema(implementation = PromptsResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Parejas duplicadas en el JSON o ya existentes", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/import")
  public HttpResponse<PromptsResponse> importPrompts(@Parameter(hidden = true) @Nullable @Body JsonNode body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    return HttpResponse.created(new PromptsResponse(service.importPrompts(userId, orEmpty(body))));
  }

  @Operation(operationId = "updateWouldYouRatherPrompt", summary = "Editar o activar/desactivar un dilema")
  @RequestBody(content = @Content(schema = @Schema(implementation = UpdatePromptBody.class)))
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = PromptResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos u opciones iguales tras normalizar",
      content = @Content(schema = @Schema(oneOf = {ValidationErrorResponse.class, ApiError.class})))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrado", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Pareja duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Patch("/{id}")
  public PromptResponse update(@PathVariable String id, @Parameter(hidden = true) @Nullable @Body JsonNode body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    return new PromptResponse(service.update(userId, validId(id), orEmpty(body)));
  }

  @Operation(operationId = "deleteWouldYouRatherPrompt", summary = "Borrar un dilema")
  @ApiResponse(responseCode = "204", description = "Sin contenido")
  @ApiResponse(responseCode = "400", description = "Id demasiado largo", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrado", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Delete("/{id}")
  public HttpResponse<Void> delete(@PathVariable String id, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    service.delete(userId, validId(id));
    return HttpResponse.noContent();
  }

  @Serdeable
  public record PromptsResponse(List<WouldYouRatherPromptView> prompts) {}

  @Serdeable
  public record PromptResponse(WouldYouRatherPromptView prompt) {}

  /**
   * Solo documenta el cuerpo en OpenAPI; la validación la hace el servicio (ver {@code CreateCategoryBody} sobre
   * {@code additionalProperties}).
   */
  @Serdeable
  @Schema(name = "CreateWouldYouRatherPromptRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
      description = "Estricto: una clave desconocida es un 400 `unrecognized_keys`. Las opciones se recortan y deben "
          + "ser distintas (comparación base de `es`).")
  public record CreatePromptBody(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 4, maxLength = 180) String optionA,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 4, maxLength = 180) String optionB) {}

  /** Solo documenta el cuerpo en OpenAPI. */
  @Serdeable
  @Schema(name = "UpdateWouldYouRatherPromptRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
      description = "Estricto: al menos uno de los tres campos, ninguno admite `null` y una clave desconocida es un 400 "
          + "`unrecognized_keys`.")
  public record UpdatePromptBody(
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, minLength = 4, maxLength = 180) String optionA,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, minLength = 4, maxLength = 180) String optionB,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED) Boolean enabled) {}

  /** Solo documenta el cuerpo en OpenAPI. */
  @Serdeable
  @Schema(name = "ImportWouldYouRatherPromptsRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
      description = "Estricto en ambos niveles; `version` es el literal 1 y se importan de 1 a 100 dilemas, todos o "
          + "ninguno.")
  public record ImportPromptsBody(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "1", maximum = "1") int version,
      @ArraySchema(schema = @Schema(implementation = CreatePromptBody.class), minItems = 1, maxItems = 100,
          arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED))
      List<CreatePromptBody> prompts) {}
}
