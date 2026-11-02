package es.pokemonuniverse.adapters.in.rest.health;

import es.pokemonuniverse.application.health.SchemaVersionReader;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.lang.management.ManagementFactory;
import java.time.Instant;

@Tag(name = "health")
@Controller("/api/health")
@ExecuteOn(TaskExecutors.BLOCKING)
public class HealthController {

  private final SchemaVersionReader schema;
  private final Clock clock;
  private final String commit;
  private final long startedAtMillis = ManagementFactory.getRuntimeMXBean().getStartTime();

  public HealthController(SchemaVersionReader schema, Clock clock, PuConfig config) {
    this.schema = schema;
    this.clock = clock;
    this.commit = config.commitSha() == null || config.commitSha().isEmpty() ? "development" : config.commitSha();
  }

  @Operation(summary = "Estado del servicio", operationId = "getHealth")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = HealthResponse.class)))
  @Get
  public HealthResponse health() {
    var version = schema.latestMigration();
    long now = clock.now();
    return new HealthResponse("ok", "ready", version, Math.max(0, (now - startedAtMillis) / 1000), commit,
        IsoTimestamps.millis(Instant.ofEpochMilli(now)));
  }
}
