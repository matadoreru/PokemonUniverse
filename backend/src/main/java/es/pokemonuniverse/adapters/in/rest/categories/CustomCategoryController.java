package es.pokemonuniverse.adapters.in.rest.categories;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.categories.CustomCategoryView;
import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
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

  private static final String REGISTERED_REQUIRED = "Registered account required";
  private static final int MAX_ID_LENGTH = 128;

  private final CustomCategoryService service;

  public CustomCategoryController(CustomCategoryService service) {
    this.service = service;
  }

  @Operation(operationId = "listCustomCategories", summary = "Listar mis categorías personalizadas")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = CategoriesResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public CategoriesResponse list(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    return new CategoriesResponse(service.list(registered(current)));
  }

  @Operation(operationId = "createCustomCategory", summary = "Crear una categoría personalizada")
  @RequestBody(content = @Content(schema = @Schema(implementation = CreateCategoryBody.class)))
  @ApiResponse(responseCode = "201", description = "Creada", content = @Content(schema = @Schema(implementation = CategoryResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post
  public HttpResponse<CategoryResponse> create(@Parameter(hidden = true) @Nullable @Body JsonNode body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registered(current);
    return HttpResponse.created(new CategoryResponse(service.create(userId, body)));
  }

  @Operation(operationId = "updateCustomCategory", summary = "Editar o activar/desactivar una categoría personalizada")
  @RequestBody(content = @Content(schema = @Schema(implementation = UpdateCategoryBody.class)))
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = CategoryResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Duplicada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Patch("/{id}")
  public CategoryResponse update(@PathVariable String id, @Parameter(hidden = true) @Nullable @Body JsonNode body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registered(current);
    return new CategoryResponse(service.update(userId, validId(id), body));
  }

  @Operation(operationId = "deleteCustomCategory", summary = "Borrar una categoría personalizada")
  @ApiResponse(responseCode = "204", description = "Sin contenido")
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No encontrada", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Delete("/{id}")
  public HttpResponse<Void> delete(@PathVariable String id, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registered(current);
    service.delete(userId, validId(id));
    return HttpResponse.noContent();
  }

  private static String registered(Optional<AuthUser> current) {
    return current.filter(user -> user.kind() == AuthUser.Kind.USER)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED))
        .id();
  }

  /** {@code z.string().min(1).max(128)} del router; un segmento vacío no llega a esta ruta. */
  private static String validId(String id) {
    if (id.length() > MAX_ID_LENGTH) {
      var issues = new ZodIssues();
      issues.tooBig("string", MAX_ID_LENGTH, List.of(), "Too big: expected string to have <=128 characters");
      throw new InvalidInputException(issues);
    }
    return id;
  }

  @Serdeable
  public record CategoriesResponse(List<CustomCategoryView> categories) {}

  @Serdeable
  public record CategoryResponse(CustomCategoryView category) {}

  /** Solo documenta el cuerpo en OpenAPI; la validación la hace el servicio. */
  @Serdeable
  @Schema(name = "CreateCustomCategoryRequest")
  public record CreateCategoryBody(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 4, maxLength = 160) String text) {}

  /** Solo documenta el cuerpo en OpenAPI; al menos uno de los dos campos. */
  @Serdeable
  @Schema(name = "UpdateCustomCategoryRequest")
  public record UpdateCategoryBody(@Nullable @Schema(minLength = 4, maxLength = 160) String text,
      @Nullable Boolean enabled) {}
}
