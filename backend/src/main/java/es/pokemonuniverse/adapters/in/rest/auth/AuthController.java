package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.adapters.in.rest.identity.SessionCookies;
import es.pokemonuniverse.application.auth.AuthService;
import es.pokemonuniverse.application.auth.GuestAvatarCleanup;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.auth.PasswordResetService;
import es.pokemonuniverse.application.ports.AvatarStorage;
import es.pokemonuniverse.application.profile.ProfileService;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.profile.ProfileVisibility;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.MutableHttpResponse;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Patch;
import io.micronaut.http.annotation.Post;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;

@Tag(name = "auth")
@Controller("/api/auth")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AuthController {

  private static final String REGISTERED_REQUIRED = "Registered account required";

  private final AuthService auth;
  private final IdentityTokens tokens;
  private final SessionCookies cookies;
  private final Validator validator;
  private final GuestAvatarCleanup guestAvatars;
  private final AvatarStorage avatars;
  private final ProfileService profiles;
  private final PasswordResetService passwordReset;

  public AuthController(AuthService auth, IdentityTokens tokens, SessionCookies cookies, Validator validator,
      GuestAvatarCleanup guestAvatars, AvatarStorage avatars, ProfileService profiles,
      PasswordResetService passwordReset) {
    this.auth = auth;
    this.tokens = tokens;
    this.cookies = cookies;
    this.validator = validator;
    this.guestAvatars = guestAvatars;
    this.avatars = avatars;
    this.profiles = profiles;
    this.passwordReset = passwordReset;
  }

  @Operation(summary = "Registrar usuario")
  @ApiResponse(responseCode = "201", description = "Creado", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "Ya existe", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/register")
  public HttpResponse<UserResponse> register(@Body RegisterRequest body, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var request = valid(body.normalized());
    return session(HttpResponse.created(new UserResponse(auth.register(request.toCommand()))));
  }

  @Operation(summary = "Iniciar sesión")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "401", description = "Credenciales incorrectas", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/login")
  public HttpResponse<UserResponse> login(@Body LoginRequest body, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var request = valid(body.normalized());
    return session(HttpResponse.ok(new UserResponse(auth.login(request.toCommand()))));
  }

  @Operation(summary = "Pedir el enlace para recuperar la contraseña")
  @ApiResponse(responseCode = "204", description = "Sin contenido; igual exista o no la cuenta")
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/password/forgot")
  public HttpResponse<Void> forgotPassword(@Body ForgotPasswordRequest body) {
    passwordReset.requestReset(valid(body.normalized()).identifier());
    return HttpResponse.noContent();
  }

  @Operation(summary = "Poner la contraseña nueva con el enlace recibido")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos o enlace caducado", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/password/reset")
  public HttpResponse<UserResponse> resetPassword(@Body ResetPasswordRequest body) {
    var request = valid(body.normalized());
    return session(HttpResponse.ok(new UserResponse(passwordReset.reset(request.token(), request.password()))));
  }

  @Operation(summary = "Entrar como invitado")
  @ApiResponse(responseCode = "201", description = "Creado", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/guest")
  public HttpResponse<UserResponse> guest(@Body GuestRequest body, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var request = valid(body.normalized());
    var response = session(HttpResponse.created(new UserResponse(auth.guest(request.toCommand()))));
    guestAvatars.removePriorGuestAvatar(current, null);
    return response;
  }

  @Operation(summary = "Cerrar sesión")
  @ApiResponse(responseCode = "204", description = "Sin contenido")
  @Post("/logout")
  public HttpResponse<Void> logout(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    MutableHttpResponse<Void> response = HttpResponse.noContent();
    cookies.clear(response);
    guestAvatars.removePriorGuestAvatar(current, null);
    return response;
  }

  @Operation(summary = "Obtener imagen de avatar")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(mediaType = "image/webp", schema = @Schema(type = "string", format = "binary")))
  @ApiResponse(responseCode = "404", description = "No encontrado")
  @Get("/avatars/{filename}")
  public HttpResponse<byte[]> avatar(String filename) {
    if (!AvatarRef.isValidCustomFile(filename)) return HttpResponse.notFound();
    return avatars.read(filename)
        .map(bytes -> HttpResponse.ok(bytes)
            .contentType(MediaType.of("image/webp"))
            .header("Cache-Control", "public, max-age=31536000, immutable"))
        .orElseGet(HttpResponse::notFound);
  }

  @Operation(summary = "Usuario de la sesión actual")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = UserResponse.class)))
  @Get("/me")
  public UserResponse me(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    return new UserResponse(current.orElse(null));
  }

  @Operation(summary = "Perfil con estadísticas por minijuego")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = ProfileResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/profile")
  public ProfileResponse profile(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var user = current.filter(u -> u.kind() == AuthUser.Kind.USER)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED));
    return profiles.profileOf(user.id()).map(ProfileResponse::from).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED));
  }

  @Operation(summary = "Cambiar quién puede ver el perfil (nivel, estadísticas y logros)")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = ProfileSettingsResponse.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Patch("/profile")
  public ProfileSettingsResponse updateProfile(@Body ProfileSettingsRequest body,
      @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var user = current.filter(u -> u.kind() == AuthUser.Kind.USER)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED));
    var visibility = ProfileVisibility.valueOf(valid(body).profileVisibility());
    if (!profiles.changeVisibility(user.id(), visibility)) throw new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED);
    return new ProfileSettingsResponse(visibility);
  }

  @Operation(summary = "Nivel y experiencia de la cuenta registrada")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = ProgressResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/progress")
  public ProgressResponse progress(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var user = current.filter(u -> u.kind() == AuthUser.Kind.USER)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED));
    return profiles.progressOf(user.id()).map(p -> new ProgressResponse(ProfileResponse.Progress.from(p)))
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED));
  }

  /** Valida el cuerpo ya normalizado; el manejador global da formato al fallo con la ruta del campo. */
  private <T> T valid(T normalized) {
    Set<jakarta.validation.ConstraintViolation<T>> violations = validator.validate(normalized);
    if (!violations.isEmpty()) throw new ConstraintViolationException(violations);
    return normalized;
  }

  private HttpResponse<UserResponse> session(MutableHttpResponse<UserResponse> response) {
    cookies.establish(response, tokens.sign(response.body().user(), Instant.now()));
    return response;
  }
}
