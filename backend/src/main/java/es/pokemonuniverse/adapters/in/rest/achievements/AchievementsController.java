package es.pokemonuniverse.adapters.in.rest.achievements;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.registeredUserId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.achievements.AchievementService;
import es.pokemonuniverse.domain.identity.AuthUser;
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

/** Logros de la cuenta registrada; un invitado o una petición sin sesión reciben 401. */
@Tag(name = "achievements")
@Controller("/api/achievements")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AchievementsController {

  private final AchievementService achievements;

  public AchievementsController(AchievementService achievements) {
    this.achievements = achievements;
  }

  @Operation(summary = "Logros de la cuenta; los secretos bloqueados no revelan nombre ni descripción")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = AchievementsResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public AchievementsResponse list(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    return AchievementsResponse.of(achievements.listFor(registeredUserId(current)));
  }
}
