package es.pokemonuniverse.adapters.in.rest.auth;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.registeredUserId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.in.rest.RequestTooLargeHandler;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.adapters.in.rest.identity.SessionCookies;
import es.pokemonuniverse.application.auth.GuestAvatarCleanup;
import es.pokemonuniverse.application.avatar.AvatarAssignment;
import es.pokemonuniverse.application.avatar.AvatarUploads;
import es.pokemonuniverse.application.avatar.AvatarService;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpHeaders;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.MutableHttpResponse;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Consumes;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Delete;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.annotation.Put;
import io.micronaut.http.annotation.QueryValue;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Optional;

/**
 * Rutas de escritura de avatar de {@code apps/server/src/auth/routes.ts}. El orden de las comprobaciones copia el de
 * los middlewares de Express:
 *
 * <ul>
 *   <li>invitado: límite → {@code express.raw} (413) → {@code displayName} (400 Zod) → tipo (415) → procesado;</li>
 *   <li>perfil: {@code requireUser} (401) → límite → {@code express.raw} (413) → tipo (415) → procesado.</li>
 * </ul>
 *
 * El límite de 12 por 15 min lo aplica {@code RateLimitFilter} (política {@code avatars}). Las rutas aceptan cualquier
 * {@code Content-Type} para responder el 415 de Node en vez del de Micronaut. Un cuerpo de más de 5 MiB recibe el 413
 * de body-parser ({@code request entity too large}): el literal «La imagen supera el límite de 5 MB.» solo llega con
 * 400 desde {@code processAndStore} (cuerpo vacío).
 */
@Tag(name = "auth")
@Controller("/api/auth")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AvatarController {

  static final String UNSUPPORTED_TYPE = "Usa una imagen JPEG, PNG o WEBP.";

  private final AvatarUploads uploads;
  private final AvatarAssignment assignment;
  private final SessionCookies cookies;
  private final GuestAvatarCleanup guestAvatars;

  public AvatarController(AvatarUploads uploads, AvatarAssignment assignment, SessionCookies cookies,
      GuestAvatarCleanup guestAvatars) {
    this.uploads = uploads;
    this.assignment = assignment;
    this.cookies = cookies;
    this.guestAvatars = guestAvatars;
  }

  @Operation(operationId = "createGuestWithCustomAvatar", summary = "Entrar como invitado con un avatar subido")
  @RequestBody(required = true, content = {
      @Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
      @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary")),
      @Content(mediaType = "image/webp", schema = @Schema(type = "string", format = "binary"))})
  @ApiResponse(responseCode = "201", description = "Creado", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @ApiResponse(responseCode = "400", description = "Nombre (incidencias Zod) o imagen no válidos",
      content = @Content(schema = @Schema(oneOf = {ValidationErrorResponse.class, ApiError.class})))
  @ApiResponse(responseCode = "413", description = "Más de 5 MiB", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "415", description = "No es JPEG, PNG ni WEBP", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "429", description = "Demasiadas peticiones", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/guest/custom-avatar")
  @Consumes(MediaType.ALL)
  public HttpResponse<UserResponse> guestCustomAvatar(@Parameter(hidden = true) HttpRequest<?> request,
      @Parameter(description = "Nombre del invitado (2 a 24 letras, números, espacios, `_` o `-`).", required = true)
      @Nullable @QueryValue String displayName,
      @Parameter(hidden = true) @Nullable @Body byte[] body, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var contentType = request.getHeaders().get(HttpHeaders.CONTENT_TYPE);
    rejectOversize(contentType, body);
    // Se leen todos los valores: repetido en la query, qs lo convierte en array (el parámetro solo lo documenta).
    var name = AvatarRequests.displayName(request.getParameters().getAll("displayName"));
    if (!AvatarRequests.isImage(contentType)) throw unsupported();
    var guest = uploads.uploadForGuest(name, body, contentType);
    var response = session(HttpResponse.created(new UserResponse(guest)));
    guestAvatars.removePriorGuestAvatar(current, ((AvatarRef.Custom) guest.avatar()).value());
    return response;
  }

  @Operation(operationId = "resetAvatar", summary = "Volver al avatar por defecto")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "429", description = "Demasiadas peticiones", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Delete("/profile/avatar")
  public HttpResponse<UserResponse> resetAvatar(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    return session(HttpResponse.ok(new UserResponse(assignment.apply(userId, new AvatarRef.Default()))));
  }

  @Operation(operationId = "uploadCustomAvatar", summary = "Subir un avatar personalizado")
  @RequestBody(required = true, content = {
      @Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
      @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary")),
      @Content(mediaType = "image/webp", schema = @Schema(type = "string", format = "binary"))})
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @ApiResponse(responseCode = "400", description = "Imagen no válida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "413", description = "Más de 5 MiB", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "415", description = "No es JPEG, PNG ni WEBP", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "429", description = "Demasiadas peticiones", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Put("/profile/avatar/custom")
  @Consumes(MediaType.ALL)
  public HttpResponse<UserResponse> customAvatar(@Parameter(hidden = true) HttpRequest<?> request,
      @Parameter(hidden = true) @Nullable @Body byte[] body, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    var contentType = request.getHeaders().get(HttpHeaders.CONTENT_TYPE);
    rejectOversize(contentType, body);
    if (!AvatarRequests.isImage(contentType)) throw unsupported();
    return session(HttpResponse.ok(new UserResponse(uploads.uploadForUser(userId, body, contentType))));
  }

  /** {@code express.raw} solo lee (y limita) los tipos de imagen; el resto de cuerpos llega como si no hubiera. */
  private static void rejectOversize(@Nullable String contentType, @Nullable byte[] body) {
    if (body != null && body.length > AvatarService.MAX_UPLOAD_BYTES && AvatarRequests.isImage(contentType)) {
      throw new ApiException(HttpStatus.REQUEST_ENTITY_TOO_LARGE, RequestTooLargeHandler.MESSAGE);
    }
  }

  private static ApiException unsupported() {
    return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, UNSUPPORTED_TYPE);
  }

  private HttpResponse<UserResponse> session(MutableHttpResponse<UserResponse> response) {
    return cookies.establishFor(response, response.body().user());
  }
}
