package es.pokemonuniverse.adapters.in.rest.games;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

@Controller("/api/games")
@ExecuteOn(TaskExecutors.BLOCKING)
public class GamesController {

  private final GameRegistry registry;

  public GamesController(GameRegistry registry) {
    this.registry = registry;
  }

  @Get
  public GamesResponse list() {
    return new GamesResponse(registry.list());
  }

  @Serdeable
  public record GamesResponse(List<GameManifest> games) {}
}
