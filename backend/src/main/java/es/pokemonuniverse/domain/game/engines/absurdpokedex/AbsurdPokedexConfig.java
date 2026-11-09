package es.pokemonuniverse.domain.game.engines.absurdpokedex;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code absurdPokedexConfigSchema} de {@code absurd-pokedex/config.ts}); estricta. Los
 * componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record AbsurdPokedexConfig(
    List<Integer> generations,
    int rounds,
    int writeSeconds,
    int voteSeconds,
    AbsurdPokedexMode mode) {

  private static final Set<String> KEYS = Set.of("generations", "rounds", "writeSeconds", "voteSeconds", "mode");

  public AbsurdPokedexConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultAbsurdPokedexConfig}. */
  public static AbsurdPokedexConfig defaults() {
    return builder().generations(ConfigReader.allGenerations()).rounds(5).writeSeconds(60).voteSeconds(30).build();
  }

  public static Builder builder() {
    return new Builder();
  }

  /** Tres enteros contiguos: setters con nombre. */
  public static final class Builder {
    private List<Integer> generations = List.of();
    private int rounds;
    private int writeSeconds;
    private int voteSeconds;
    private AbsurdPokedexMode mode = AbsurdPokedexMode.CLASSIC;

    private Builder() {}

    public Builder generations(List<Integer> value) { generations = value; return this; }

    public Builder rounds(int value) { rounds = value; return this; }

    public Builder writeSeconds(int value) { writeSeconds = value; return this; }

    public Builder voteSeconds(int value) { voteSeconds = value; return this; }

    public Builder mode(AbsurdPokedexMode value) { mode = value; return this; }

    public AbsurdPokedexConfig build() {
      return new AbsurdPokedexConfig(generations, rounds, writeSeconds, voteSeconds, mode);
    }
  }

  /**
   * {@code absurdPokedexConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes; cada
   * campo es un entero seguro en sus límites ({@code 10.0} vale y {@code 10.5} no); {@code mode} ausente es
   * {@code CLASSIC}.
   */
  public static AbsurdPokedexConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokédex Absurda");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int rounds = config.integer("rounds", 1, 10);
    int writeSeconds = config.integer("writeSeconds", 30, 120);
    int voteSeconds = config.integer("voteSeconds", 15, 60);
    return builder().generations(generations).rounds(rounds).writeSeconds(writeSeconds).voteSeconds(voteSeconds)
        .mode(config.enumValueOrDefault("mode", AbsurdPokedexMode.class, AbsurdPokedexMode.CLASSIC)).build();
  }
}
