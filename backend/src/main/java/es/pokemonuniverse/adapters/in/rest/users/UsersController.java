package es.pokemonuniverse.adapters.in.rest.users;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.registeredUserId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.profile.PublicProfileService;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Optional;
import java.util.regex.Pattern;

/** Perfiles de otras cuentas; solo para cuentas registradas (un invitado o una petición sin sesión reciben 401). */
@Tag(name = "users")
@Controller("/api/users")
@ExecuteOn(TaskExecutors.BLOCKING)
public class UsersController {

  /** Lo que admite el registro: con otra forma no puede existir la cuenta. */
  private static final Pattern USERNAME = Pattern.compile("^[a-zA-Z0-9_]{1,24}$");
  private static final String NOT_FOUND = "User not found";

  private final PublicProfileService profiles;

  public UsersController(PublicProfileService profiles) {
    this.profiles = profiles;
  }

  @Operation(summary = "Perfil de otra cuenta por su nombre de usuario (sin distinguir mayúsculas), según su privacidad")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = PublicProfileResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No hay ninguna cuenta con ese nombre", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/{username}/profile")
  public PublicProfileResponse profile(String username, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var viewerId = registeredUserId(current);
    if (!USERNAME.matcher(username).matches()) throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND);
    return profiles.view(viewerId, username).map(PublicProfileResponse::from)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND));
  }
}
