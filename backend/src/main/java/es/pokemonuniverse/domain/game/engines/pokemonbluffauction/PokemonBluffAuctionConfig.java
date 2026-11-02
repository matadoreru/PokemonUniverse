package es.pokemonuniverse.domain.game.engines.pokemonbluffauction;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokemonBluffAuctionConfigSchema} de {@code pokemon-bluff-auction/config.ts});
 * estricta. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record PokemonBluffAuctionConfig(List<Integer> generations, int bidSeconds, int demonstrationSeconds,
    int rounds) {

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
    var generations = ConfigReader.allGenerations();
    return new PokemonBluffAuctionConfig(generations, DEFAULT_BID_SECONDS, 30, 10);
  }

  /**
   * {@code pokemonBluffAuctionConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code bidSeconds} vale 20 solo si falta la clave (un {@code null} explícito no valida);
   * {@code demonstrationSeconds} y {@code rounds} son enteros de su lista. Los enteros admiten {@code 20.0} (JS tiene
   * un único tipo numérico) y rechazan {@code 20.5}.
   */
  public static PokemonBluffAuctionConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokémon Bluff Auction");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int bidSeconds = config.has("bidSeconds") ? config.integer("bidSeconds", 0, 120) : DEFAULT_BID_SECONDS;
    int demonstrationSeconds =
        config.option("demonstrationSeconds", DEMONSTRATION_TIMES, "El tiempo debe ser 20, 30, 45 o 60 segundos");
    int rounds = config.option("rounds", ROUND_OPTIONS, "Las rondas deben ser 5, 10, 15 o 20");
    return new PokemonBluffAuctionConfig(generations, bidSeconds, demonstrationSeconds, rounds);
  }
}
