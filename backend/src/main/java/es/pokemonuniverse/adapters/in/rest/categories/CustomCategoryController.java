package es.pokemonuniverse.adapters.in.rest.categories;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.orEmpty;
import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.registeredUserId;
import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.validId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.categories.CustomCategoryView;
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
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Optional;

/**
 * {@code apps/server/src/categories/routes.ts}: todas las rutas exigen cuenta registrada ({@code requireUser}). El
 * cuerpo llega como árbol JSON y lo valida el servicio con los esquemas Zod portados, para que un invitado reciba 401
 * aunque el cuerpo traiga claves desconocidas, como en Node.
 */
@Tag(name = "categories")
@Controller("/api/categories")
@ExecuteOn(TaskExecutors.BLOCKING)
public class CustomCategoryController {

  private final CustomCategoryService service;

  public CustomCategoryController(CustomCategoryService service) {
    this.service = service;
  }

  @Operation(operationId = "listCustomCategories", summary = "Listar mis categorías personalizadas")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = CategoriesResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public CategoriesResponse list(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    return new CategoriesResponse(service.list(registeredUserId(current)));
  }

  @Operation(operationId = "createCustomCategory", summary = "Crear una categoría personalizada")
  @RequestBody(content = @Content(schema = @Schema(implementation = CreateCategoryBody.class)))
  @ApiResponse(responseCode = "201", description = "Creada", content = @Content(schema = @Schema(implementation = CategoryResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post
  public HttpResponse<CategoryResponse> create(@Parameter(hidden = true) @Nullable @Body JsonNode body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    return HttpResponse.created(new CategoryResponse(service.create(userId, orEmpty(body))));
  }

  @Operation(operationId = "updateCustomCategory", summary = "Editar o activar/desactivar una categoría personalizada")
  @RequestBody(content = @Content(schema = @Schema(implementation = UpdateCategoryBody.class)))
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = CategoryResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Patch("/{id}")
  public CategoryResponse update(@PathVariable String id, @Parameter(hidden = true) @Nullable @Body JsonNode body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    return new CategoryResponse(service.update(userId, validId(id), orEmpty(body)));
  }

  @Operation(operationId = "deleteCustomCategory", summary = "Borrar una categoría personalizada")
  @ApiResponse(responseCode = "204", description = "Sin contenido")
  @ApiResponse(responseCode = "400", description = "Id demasiado largo", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Delete("/{id}")
  public HttpResponse<Void> delete(@PathVariable String id, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    service.delete(userId, validId(id));
    return HttpResponse.noContent();
  }

  @Serdeable
  public record CategoriesResponse(List<CustomCategoryView> categories) {}

  @Serdeable
  public record CategoryResponse(CustomCategoryView category) {}

  /**
   * Solo documenta el cuerpo en OpenAPI; la validación la hace el servicio. {@code additionalProperties = FALSE}
   * declara la intención, pero micronaut-openapi 7.1 lo elimina al normalizar ({@code OpenApiNormalizeUtils}); por eso
   * la descripción lo dice también.
   */
  @Serdeable
  @Schema(name = "CreateCustomCategoryRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
      description = "Estricto: una clave desconocida es un 400 `unrecognized_keys`.")
  public record CreateCategoryBody(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 4, maxLength = 160) String text) {}

  /** Solo documenta el cuerpo en OpenAPI (ver {@link CreateCategoryBody} sobre {@code additionalProperties}). */
  @Serdeable
  @Schema(name = "UpdateCustomCategoryRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
      description = "Estricto: al menos uno de los dos campos, ninguno admite `null` y una clave desconocida es un 400 "
          + "`unrecognized_keys`.")
  public record UpdateCategoryBody(
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, minLength = 4, maxLength = 160) String text,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED) Boolean enabled) {}
}
