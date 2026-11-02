package es.pokemonuniverse.domain.game.engines.pokemonbluffauction;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokemonBluffAuctionConfigSchema} de {@code pokemon-bluff-auction/config.ts});
 * estricta. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record PokemonBluffAuctionConfig(List<Integer> generations, int bidSeconds, int demonstrationSeconds,
    int rounds) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;
  /** {@code .default(20)} de {@code bidSeconds}. */
  static final int DEFAULT_BID_SECONDS = 20;
  /** {@code demonstrationTimes} y {@code roundOptions}. */
  static final Set<Integer> DEMONSTRATION_TIMES = Set.of(20, 30, 45, 60);
  static final Set<Integer> ROUND_OPTIONS = Set.of(5, 10, 15, 20);

  private static final Set<String> KEYS = Set.of("generations", "bidSeconds", "demonstrationSeconds", "rounds");

  public PokemonBluffAuctionConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonBluffAuctionConfig}. */
  public static PokemonBluffAuctionConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new PokemonBluffAuctionConfig(generations, DEFAULT_BID_SECONDS, 30, 10);
  }

  /**
   * {@code pokemonBluffAuctionConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code bidSeconds} vale 20 solo si falta la clave (un {@code null} explícito no valida);
   * {@code demonstrationSeconds} y {@code rounds} son enteros de su lista. Los enteros admiten {@code 20.0} (JS tiene
   * un único tipo numérico) y rechazan {@code 20.5}.
   */
  public static PokemonBluffAuctionConfig parse(JsonNode raw) {
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
    var bidSecondsNode = raw.get("bidSeconds");
    int bidSeconds = bidSecondsNode == null ? DEFAULT_BID_SECONDS : integer(bidSecondsNode, "bidSeconds", 0, 120);
    int demonstrationSeconds = option(required(raw, "demonstrationSeconds"), "demonstrationSeconds",
        DEMONSTRATION_TIMES, "El tiempo debe ser 20, 30, 45 o 60 segundos");
    int rounds = option(required(raw, "rounds"), "rounds", ROUND_OPTIONS, "Las rondas deben ser 5, 10, 15 o 20");
    return new PokemonBluffAuctionConfig(new ArrayList<>(generations), bidSeconds, demonstrationSeconds, rounds);
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  /** {@code z.number().int().min(min).max(max)}. */
  private static int integer(JsonNode value, String key, int min, int max) {
    double number = whole(value, key);
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  /** {@code z.number().int().refine((value) => options.includes(value), message)}. */
  private static int option(JsonNode value, String key, Set<Integer> options, String message) {
    double number = whole(value, key);
    if (number < Integer.MIN_VALUE || number > Integer.MAX_VALUE || !options.contains((int) number)) {
      throw invalid(message);
    }
    return (int) number;
  }

  /** {@code z.number().int()}: un número finito sin parte decimal. */
  private static double whole(JsonNode value, String key) {
    if (!value.isNumber()) throw invalid(key + " debe ser un número entero");
    double number = value.getDoubleValue();
    if (number != Math.rint(number) || Double.isInfinite(number)) throw invalid(key + " debe ser un número entero");
    return number;
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Pokémon Bluff Auction no válida: " + detail + ".");
  }
}
