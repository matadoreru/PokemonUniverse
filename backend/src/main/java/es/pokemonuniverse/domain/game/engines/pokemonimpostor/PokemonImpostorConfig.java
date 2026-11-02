package es.pokemonuniverse.domain.game.engines.pokemonimpostor;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokemonImpostorConfigSchema} de {@code pokemon-impostor/config.ts}). El esquema no
 * es {@code .strict()}: las claves desconocidas se descartan. Los componentes siguen el orden de claves del esquema
 * Zod.
 */
@Serdeable
public record PokemonImpostorConfig(List<Integer> generations, int impostorCount, int clueSeconds, int voteSeconds) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  public PokemonImpostorConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonImpostorConfig}. */
  public static PokemonImpostorConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
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
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    int impostorCount = integer(required(raw, "impostorCount"), "impostorCount", 1, 10);
    int clueSeconds = integer(required(raw, "clueSeconds"), "clueSeconds", 10, 120);
    int voteSeconds = integer(required(raw, "voteSeconds"), "voteSeconds", 10, 90);
    return builder().generations(new ArrayList<>(generations)).impostorCount(impostorCount).clueSeconds(clueSeconds)
        .voteSeconds(voteSeconds).build();
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  /** {@code z.number().int().min(min).max(max)}; {@code .int()} es {@code Number.isSafeInteger} en Zod 4. */
  private static int integer(JsonNode value, String key, int min, int max) {
    if (!value.isNumber()) throw invalid(key + " debe ser un número entero");
    double number = value.getDoubleValue();
    if (!JsNumbers.isSafeInteger(number)) throw invalid(key + " debe ser un número entero");
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Pokémon Impostor no válida: " + detail + ".");
  }
}
