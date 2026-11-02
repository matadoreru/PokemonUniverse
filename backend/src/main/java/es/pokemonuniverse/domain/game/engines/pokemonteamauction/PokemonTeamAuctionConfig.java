package es.pokemonuniverse.domain.game.engines.pokemonteamauction;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokemonTeamAuctionConfigSchema} de {@code pokemon-team-auction/config.ts});
 * estricta. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record PokemonTeamAuctionConfig(List<Integer> generations, int bidSeconds, int initialBudget,
    boolean includeForms) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;
  /** {@code .default(20)} de {@code bidSeconds}. */
  static final int DEFAULT_BID_SECONDS = 20;

  private static final Set<String> KEYS = Set.of("generations", "bidSeconds", "initialBudget", "includeForms");

  public PokemonTeamAuctionConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonTeamAuctionConfig}. */
  public static PokemonTeamAuctionConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new PokemonTeamAuctionConfig(generations, DEFAULT_BID_SECONDS, 20, true);
  }

  /**
   * {@code pokemonTeamAuctionConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code bidSeconds} vale 20 solo si falta la clave (un {@code null} explícito no valida). Los enteros admiten
   * {@code 20.0} (JS tiene un único tipo numérico) y rechazan {@code 20.5}.
   */
  public static PokemonTeamAuctionConfig parse(JsonNode raw) {
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
    int initialBudget = integer(required(raw, "initialBudget"), "initialBudget", 1, 100);
    var includeForms = required(raw, "includeForms");
    if (!includeForms.isBoolean()) throw invalid("includeForms debe ser booleano");
    return new PokemonTeamAuctionConfig(new ArrayList<>(generations), bidSeconds, initialBudget,
        includeForms.getBooleanValue());
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  /** {@code z.number().int().min(min).max(max)}. */
  private static int integer(JsonNode value, String key, int min, int max) {
    if (!value.isNumber()) throw invalid(key + " debe ser un número entero");
    double number = value.getDoubleValue();
    if (number != Math.rint(number) || Double.isInfinite(number)) throw invalid(key + " debe ser un número entero");
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Pokémon Team Auction no válida: " + detail + ".");
  }
}
