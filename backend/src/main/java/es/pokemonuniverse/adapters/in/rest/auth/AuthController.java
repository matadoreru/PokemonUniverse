package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.adapters.in.rest.identity.SessionCookies;
import es.pokemonuniverse.application.auth.AuthService;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.MutableHttpResponse;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
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

  private final AuthService auth;
  private final IdentityTokens tokens;
  private final SessionCookies cookies;
  private final Validator validator;

  public AuthController(AuthService auth, IdentityTokens tokens, SessionCookies cookies, Validator validator) {
    this.auth = auth;
    this.tokens = tokens;
    this.cookies = cookies;
    this.validator = validator;
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
  // `current` lo usará la Tarea 6 (limpieza del avatar de invitado).
  public HttpResponse<UserResponse> guest(@Body GuestRequest body, @Identity Optional<AuthUser> current) {
    var request = valid(body.normalized());
    return session(HttpResponse.created(new UserResponse(auth.guest(request.toCommand()))));
  }

  @Post("/logout")
  // `current` lo usará la Tarea 6 (limpieza del avatar de invitado).
  public HttpResponse<Void> logout(@Identity Optional<AuthUser> current) {
    MutableHttpResponse<Void> response = HttpResponse.noContent();
    cookies.clear(response);
    return response;
  }

  @Get("/me")
  public UserResponse me(@Identity Optional<AuthUser> current) {
    return new UserResponse(current.orElse(null));
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
