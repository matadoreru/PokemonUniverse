package es.pokemonuniverse.adapters.in.rest.changelog;

import es.pokemonuniverse.application.changelog.ChangelogService;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

@Tag(name = "changelog")
@Controller("/api/changelog")
@ExecuteOn(TaskExecutors.BLOCKING)
public class ChangelogController {

  private final ChangelogService service;

  public ChangelogController(ChangelogService service) {
    this.service = service;
  }

  @Operation(summary = "Listar el changelog público", operationId = "listChangelog")
  @ApiResponse(responseCode = "200", description = "OK")
  @Get
  public HttpResponse<ChangelogResponse> list() {
    var entries = service.listPublished().stream().map(ChangelogEntryResponse::of).toList();
    return HttpResponse.ok(new ChangelogResponse(entries))
        .header("Cache-Control", "public, max-age=0, must-revalidate");
  }

  @Serdeable
  public record ChangelogResponse(List<ChangelogEntryResponse> entries) {}
}
