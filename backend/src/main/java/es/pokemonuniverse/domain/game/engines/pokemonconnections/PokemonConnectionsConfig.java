package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokemonConnectionsConfigSchema} de {@code pokemon-connections/config.ts});
 * estricta. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record PokemonConnectionsConfig(List<Integer> generations, int groupSize, int pokemonCount,
    int mistakesAllowed, int roundSeconds, int rounds) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS =
      Set.of("generations", "groupSize", "pokemonCount", "mistakesAllowed", "roundSeconds", "rounds");

  public PokemonConnectionsConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonConnectionsConfig}. */
  public static PokemonConnectionsConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
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
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!KEYS.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    int groupSize = integer(required(raw, "groupSize"), "groupSize", 3, 5);
    int pokemonCount = integer(required(raw, "pokemonCount"), "pokemonCount", 9, 25);
    int mistakesAllowed = integer(required(raw, "mistakesAllowed"), "mistakesAllowed", 1, 10);
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 30, 300);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 20);
    int groupCount = pokemonCount / groupSize;
    if (pokemonCount % groupSize != 0 || groupCount < 3 || groupCount > 5) {
      throw invalid("El tablero debe contener entre 3 y 5 grupos completos");
    }
    return builder().generations(new ArrayList<>(generations)).groupSize(groupSize).pokemonCount(pokemonCount)
        .mistakesAllowed(mistakesAllowed).roundSeconds(roundSeconds).rounds(rounds).build();
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
    return new ConfigValidationException("Configuración de Pokémon Connections no válida: " + detail + ".");
  }
}
