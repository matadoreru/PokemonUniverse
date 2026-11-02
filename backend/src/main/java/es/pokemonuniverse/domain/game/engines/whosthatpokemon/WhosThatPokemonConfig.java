package es.pokemonuniverse.domain.game.engines.whosthatpokemon;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code whosThatPokemonConfigSchema} de {@code whos-that-pokemon/config.ts}). El esquema
 * es {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record WhosThatPokemonConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    boolean hintsEnabled,
    boolean includeRegionalForms) {

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "rounds", "hintsEnabled", "includeRegionalForms");

  public WhosThatPokemonConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultWhosThatPokemonConfig}. */
  public static WhosThatPokemonConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new WhosThatPokemonConfig(generations, 20, 10, false, true);
  }

  /**
   * {@code whosThatPokemonConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes
   * ({@code pokemonGenerationsSchema}). Los enteros admiten {@code 10.0} y rechazan {@code 10.5}.
   */
  public static WhosThatPokemonConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "¿Quién es ese Pokémon?");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    int rounds = config.integer("rounds", 1, 20);
    boolean hintsEnabled = config.bool("hintsEnabled");
    boolean includeRegionalForms = config.bool("includeRegionalForms");
    return new WhosThatPokemonConfig(generations, roundSeconds, rounds, hintsEnabled, includeRegionalForms);
  }
}
