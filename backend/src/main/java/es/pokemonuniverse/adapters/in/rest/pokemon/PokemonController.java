package es.pokemonuniverse.adapters.in.rest.pokemon;

import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import es.pokemonuniverse.application.pokemon.PokemonSearchQuery;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.QueryValue;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

@Controller("/api/pokemon")
@ExecuteOn(TaskExecutors.BLOCKING)
public class PokemonController {

  private static final Pattern INTEGER = Pattern.compile("[+-]?\\d+");

  private final PokemonCatalogService service;

  public PokemonController(PokemonCatalogService service) {
    this.service = service;
  }

  @Get
  public HttpResponse<PokemonResponse> list(@QueryValue(defaultValue = "") String generations,
      @QueryValue(defaultValue = "") String includeForms) {
    var query = new PokemonSearchQuery(parseGenerations(generations), "true".equals(includeForms));
    return HttpResponse.ok(new PokemonResponse(service.search(query)))
        .header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  }

  /** Solo enteros 1 a 9, sin duplicados; el resto de valores se ignora. */
  static List<Integer> parseGenerations(String raw) {
    return Arrays.stream(raw.split(","))
        .map(String::trim)
        .filter(t -> INTEGER.matcher(t).matches())
        .map(t -> {
          try {
            return Integer.valueOf(t.startsWith("+") ? t.substring(1) : t);
          } catch (NumberFormatException e) {
            return 0;
          }
        })
        .filter(n -> n >= 1 && n <= 9)
        .distinct()
        .toList();
  }

  @Serdeable
  public record PokemonResponse(List<Pokemon> pokemon) {}
}
