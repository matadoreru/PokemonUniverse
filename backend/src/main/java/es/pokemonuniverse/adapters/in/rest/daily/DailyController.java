package es.pokemonuniverse.adapters.in.rest.daily;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.registeredUserId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.daily.DailyChallengeService;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.context.annotation.Requires;
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

/**
 * Lecturas del reto diario: el reto de hoy y su clasificación. Solo cuentas registradas: un invitado o una petición sin
 * sesión reciben 401. La partida se empieza por el {@code /ws} ({@code daily:start}), no aquí.
 */
@Tag(name = "daily")
@Controller("/api/daily")
@ExecuteOn(TaskExecutors.BLOCKING)
@Requires(beans = DailyChallengeService.class)
public class DailyController {

  private final DailyChallengeService daily;

  public DailyController(DailyChallengeService daily) {
    this.daily = daily;
  }

  @Operation(summary = "El reto diario de hoy y el estado propio")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = DailyOverviewResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public DailyOverviewResponse overview(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    registeredUserId(current);
    return DailyOverviewResponse.of(daily.overview(current.orElseThrow()));
  }

  @Operation(summary = "Clasificación del reto diario de hoy")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = DailyLeaderboardResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Sin intento de hoy: juega el reto primero", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/leaderboard")
  public DailyLeaderboardResponse leaderboard(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    registeredUserId(current);
    return DailyLeaderboardResponse.of(daily.leaderboard(current.orElseThrow()));
  }
}
