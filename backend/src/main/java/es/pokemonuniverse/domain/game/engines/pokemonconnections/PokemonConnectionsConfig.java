package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokemonConnectionsConfigSchema} de {@code pokemon-connections/config.ts});
 * estricta. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record PokemonConnectionsConfig(List<Integer> generations, int groupSize, int pokemonCount,
    int mistakesAllowed, int roundSeconds, int rounds) {

  private static final Set<String> KEYS =
      Set.of("generations", "groupSize", "pokemonCount", "mistakesAllowed", "roundSeconds", "rounds");

  public PokemonConnectionsConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonConnectionsConfig}. */
  public static PokemonConnectionsConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return builder().generations(generations).groupSize(4).pokemonCount(16).mistakesAllowed(4).roundSeconds(120)
        .rounds(5).build();
  }

  public static Builder builder() {
    return new Builder();
  }

  /** Cinco enteros contiguos: setters con nombre. */
  public static final class Builder {
    private List<Integer> generations = List.of();
    private int groupSize;
    private int pokemonCount;
    private int mistakesAllowed;
    private int roundSeconds;
    private int rounds;

    private Builder() {}

    public Builder generations(List<Integer> value) { generations = value; return this; }

    public Builder groupSize(int value) { groupSize = value; return this; }

    public Builder pokemonCount(int value) { pokemonCount = value; return this; }

    public Builder mistakesAllowed(int value) { mistakesAllowed = value; return this; }

    public Builder roundSeconds(int value) { roundSeconds = value; return this; }

    public Builder rounds(int value) { rounds = value; return this; }

    public PokemonConnectionsConfig build() {
      return new PokemonConnectionsConfig(generations, groupSize, pokemonCount, mistakesAllowed, roundSeconds, rounds);
    }
  }

  /**
   * {@code pokemonConnectionsConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * cada campo es un entero seguro en sus límites y {@code pokemonCount / groupSize} debe ser un entero de 3 a 5
   * ({@code superRefine}). Los enteros admiten {@code 16.0} (JS tiene un único tipo numérico) y rechazan {@code 16.5}.
   */
  public static PokemonConnectionsConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokémon Connections");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int groupSize = config.integer("groupSize", 3, 5);
    int pokemonCount = config.integer("pokemonCount", 9, 25);
    int mistakesAllowed = config.integer("mistakesAllowed", 1, 10);
    int roundSeconds = config.integer("roundSeconds", 30, 300);
    int rounds = config.integer("rounds", 1, 20);
    int groupCount = pokemonCount / groupSize;
    if (pokemonCount % groupSize != 0 || groupCount < 3 || groupCount > 5) {
      throw config.invalid("El tablero debe contener entre 3 y 5 grupos completos");
    }
    return builder().generations(generations).groupSize(groupSize).pokemonCount(pokemonCount)
        .mistakesAllowed(mistakesAllowed).roundSeconds(roundSeconds).rounds(rounds).build();
  }
}
