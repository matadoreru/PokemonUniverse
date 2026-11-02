package es.pokemonuniverse.domain.game.engines.poketaboo;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/** Configuración normalizada ({@code pokeTabooConfigSchema} de {@code poke-taboo/config.ts}); el esquema es estricto. */
@Serdeable
public record PokeTabooConfig(List<Integer> generations, int roundSeconds, int laps, boolean includeRegionalForms) {

  /** {@code tabooRoundSeconds}: las únicas duraciones admitidas. */
  static final List<Integer> ROUND_SECONDS = List.of(30, 45, 60, 90, 120);

  private static final Set<String> KEYS = Set.of("generations", "roundSeconds", "laps", "includeRegionalForms");

  public PokeTabooConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokeTabooConfig}. */
  public static PokeTabooConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new PokeTabooConfig(generations, 60, 1, true);
  }

  /**
   * {@code pokeTabooConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code roundSeconds} entero y uno de {@code tabooRoundSeconds} ({@code refine}). Los enteros admiten {@code 60.0}
   * (JS tiene un único tipo numérico) y rechazan {@code 60.5}.
   */
  public static PokeTabooConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "PokéTaboo");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", Integer.MIN_VALUE, Integer.MAX_VALUE);
    if (!ROUND_SECONDS.contains(roundSeconds)) {
      config.rejectContinuable("roundSeconds", "El tiempo debe ser 30, 45, 60, 90 o 120 segundos");
    }
    int laps = config.integer("laps", 1, 5);
    boolean includeRegionalForms = config.bool("includeRegionalForms");
    return new PokeTabooConfig(generations, roundSeconds, laps, includeRegionalForms);
  }
}
