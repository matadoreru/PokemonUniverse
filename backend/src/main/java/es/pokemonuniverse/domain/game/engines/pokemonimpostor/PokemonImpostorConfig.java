package es.pokemonuniverse.domain.game.engines.pokemonimpostor;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * Configuración normalizada ({@code pokemonImpostorConfigSchema} de {@code pokemon-impostor/config.ts}). El esquema no
 * es {@code .strict()}: las claves desconocidas se descartan. Los componentes siguen el orden de claves del esquema
 * Zod.
 */
@Serdeable
public record PokemonImpostorConfig(List<Integer> generations, int impostorCount, int clueSeconds, int voteSeconds) {

  public PokemonImpostorConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonImpostorConfig}. */
  public static PokemonImpostorConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return builder().generations(generations).impostorCount(1).clueSeconds(15).voteSeconds(20).build();
  }

  public static Builder builder() {
    return new Builder();
  }

  /** Tres enteros contiguos: setters con nombre. */
  public static final class Builder {
    private List<Integer> generations = List.of();
    private int impostorCount;
    private int clueSeconds;
    private int voteSeconds;

    private Builder() {}

    public Builder generations(List<Integer> value) { generations = value; return this; }

    public Builder impostorCount(int value) { impostorCount = value; return this; }

    public Builder clueSeconds(int value) { clueSeconds = value; return this; }

    public Builder voteSeconds(int value) { voteSeconds = value; return this; }

    public PokemonImpostorConfig build() {
      return new PokemonImpostorConfig(generations, impostorCount, clueSeconds, voteSeconds);
    }
  }

  /**
   * {@code pokemonImpostorConfigSchema.parse}: objeto no estricto; {@code generations} sin duplicados y ascendentes;
   * cada campo es un entero seguro en sus límites. Los enteros admiten {@code 15.0} (JS tiene un único tipo numérico)
   * y rechazan {@code 15.5}.
   */
  public static PokemonImpostorConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokémon Impostor");
    var generations = config.generations("generations");
    int impostorCount = config.integer("impostorCount", 1, 10);
    int clueSeconds = config.integer("clueSeconds", 10, 120);
    int voteSeconds = config.integer("voteSeconds", 10, 90);
    return builder().generations(generations).impostorCount(impostorCount).clueSeconds(clueSeconds)
        .voteSeconds(voteSeconds).build();
  }
}
