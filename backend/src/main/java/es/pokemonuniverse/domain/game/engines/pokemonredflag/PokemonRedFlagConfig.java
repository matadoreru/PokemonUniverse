package es.pokemonuniverse.domain.game.engines.pokemonredflag;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/** Configuración normalizada ({@code pokemonRedFlagConfigSchema} de {@code pokemon-red-flag/config.ts}); estricta. */
@Serdeable
public record PokemonRedFlagConfig(List<Integer> generations, int rounds, int phaseSeconds, boolean includeForms,
    PokemonRedFlagMode mode) {

  private static final Set<String> KEYS = Set.of("generations", "rounds", "phaseSeconds", "includeForms", "mode");

  public PokemonRedFlagConfig {
    generations = List.copyOf(generations);
  }

  /** {@code mode}: {@code z.enum(['RED', 'GREEN', 'MIXED'])}. */
  public enum PokemonRedFlagMode { RED, GREEN, MIXED }

  /** {@code defaultPokemonRedFlagConfig}. */
  public static PokemonRedFlagConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new PokemonRedFlagConfig(generations, 5, 30, true, PokemonRedFlagMode.RED);
  }

  /**
   * {@code pokemonRedFlagConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los
   * enteros admiten {@code 3.0} (JS tiene un único tipo numérico) y rechazan {@code 3.5}.
   */
  public static PokemonRedFlagConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokémon Red Flag");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int rounds = config.integer("rounds", 1, 10);
    int phaseSeconds = config.integer("phaseSeconds", 15, 120);
    boolean includeForms = config.bool("includeForms");
    return new PokemonRedFlagConfig(generations, rounds, phaseSeconds, includeForms,
        config.enumValue("mode", PokemonRedFlagMode.class));
  }
}
