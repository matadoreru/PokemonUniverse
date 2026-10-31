package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.adapters.in.rest.identity.SessionCookies;
import es.pokemonuniverse.application.auth.AuthService;
import es.pokemonuniverse.application.auth.GuestAvatarCleanup;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.profile.ProfileService;
import es.pokemonuniverse.adapters.in.rest.ApiException;
import io.micronaut.http.HttpStatus;
import es.pokemonuniverse.application.ports.AvatarStorage;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.MutableHttpResponse;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Post;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;

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

  public AuthController(AuthService auth, IdentityTokens tokens, SessionCookies cookies, Validator validator,
      GuestAvatarCleanup guestAvatars, AvatarStorage avatars, ProfileService profiles) {
    this.auth = auth;
    this.tokens = tokens;
    this.cookies = cookies;
    this.validator = validator;
    this.guestAvatars = guestAvatars;
    this.avatars = avatars;
    this.profiles = profiles;
  }

  @Post("/register")
  public HttpResponse<UserResponse> register(@Body RegisterRequest body, @Identity Optional<AuthUser> current) {
    var request = valid(body.normalized());
    return session(HttpResponse.created(new UserResponse(auth.register(request.toCommand()))));
  }

  @Post("/login")
  public HttpResponse<UserResponse> login(@Body LoginRequest body, @Identity Optional<AuthUser> current) {
    var request = valid(body.normalized());
    return session(HttpResponse.ok(new UserResponse(auth.login(request.toCommand()))));
  }

  @Post("/guest")
  public HttpResponse<UserResponse> guest(@Body GuestRequest body, @Identity Optional<AuthUser> current) {
    var request = valid(body.normalized());
    var response = session(HttpResponse.created(new UserResponse(auth.guest(request.toCommand()))));
    guestAvatars.removePriorGuestAvatar(current, null);
    return response;
  }

  @Post("/logout")
  public HttpResponse<Void> logout(@Identity Optional<AuthUser> current) {
    MutableHttpResponse<Void> response = HttpResponse.noContent();
    cookies.clear(response);
    guestAvatars.removePriorGuestAvatar(current, null);
    return response;
  }

  @Get("/avatars/{filename}")
  public HttpResponse<byte[]> avatar(String filename) {
    if (!AvatarRef.isValidCustomFile(filename)) return HttpResponse.notFound();
    return avatars.read(filename)
        .map(bytes -> HttpResponse.ok(bytes)
            .contentType(MediaType.of("image/webp"))
            .header("Cache-Control", "public, max-age=31536000, immutable"))
        .orElseGet(HttpResponse::notFound);
  }

  @Get("/me")
  public UserResponse me(@Identity Optional<AuthUser> current) {
    return new UserResponse(current.orElse(null));
  }

  @Get("/profile")
  public ProfileResponse profile(@Identity Optional<AuthUser> current) {
    var user = current.filter(u -> u.kind() == AuthUser.Kind.USER)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED));
    return profiles.profileOf(user.id()).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, REGISTERED_REQUIRED));
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
