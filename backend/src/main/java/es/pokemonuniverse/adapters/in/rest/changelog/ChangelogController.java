package es.pokemonuniverse.adapters.in.rest.changelog;

import es.pokemonuniverse.application.changelog.ChangelogService;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

@Controller("/api/changelog")
@ExecuteOn(TaskExecutors.BLOCKING)
public class ChangelogController {

  private final ChangelogService service;

  public ChangelogController(ChangelogService service) {
    this.service = service;
  }

  @Get
  public HttpResponse<ChangelogResponse> list() {
    var entries = service.listPublished().stream().map(ChangelogEntryResponse::of).toList();
    return HttpResponse.ok(new ChangelogResponse(entries))
        .header("Cache-Control", "public, max-age=0, must-revalidate");
  }

  @Serdeable
  public record ChangelogResponse(List<ChangelogEntryResponse> entries) {}
}
