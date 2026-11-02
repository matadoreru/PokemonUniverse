package es.pokemonuniverse.domain.game.engines.pokemonteamauction;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokemonTeamAuctionConfigSchema} de {@code pokemon-team-auction/config.ts});
 * estricta. Los componentes siguen el orden de claves del esquema Zod.
 */
@Serdeable
public record PokemonTeamAuctionConfig(List<Integer> generations, int bidSeconds, int initialBudget,
    boolean includeForms) {

  /** {@code .default(20)} de {@code bidSeconds}. */
  static final int DEFAULT_BID_SECONDS = 20;

  private static final Set<String> KEYS = Set.of("generations", "bidSeconds", "initialBudget", "includeForms");

  public PokemonTeamAuctionConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonTeamAuctionConfig}. */
  public static PokemonTeamAuctionConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new PokemonTeamAuctionConfig(generations, DEFAULT_BID_SECONDS, 20, true);
  }

  /**
   * {@code pokemonTeamAuctionConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code bidSeconds} vale 20 solo si falta la clave (un {@code null} explícito no valida). Los enteros admiten
   * {@code 20.0} (JS tiene un único tipo numérico) y rechazan {@code 20.5}.
   */
  public static PokemonTeamAuctionConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokémon Team Auction");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int bidSeconds = config.has("bidSeconds") ? config.integer("bidSeconds", 0, 120) : DEFAULT_BID_SECONDS;
    int initialBudget = config.integer("initialBudget", 1, 100);
    boolean includeForms = config.bool("includeForms");
    return new PokemonTeamAuctionConfig(generations, bidSeconds, initialBudget, includeForms);
  }
}
