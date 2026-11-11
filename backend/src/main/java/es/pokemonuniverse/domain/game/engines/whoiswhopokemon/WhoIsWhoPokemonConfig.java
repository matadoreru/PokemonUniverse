package es.pokemonuniverse.domain.game.engines.whoiswhopokemon;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code whoIsWhoPokemonConfigSchema} de {@code who-is-who-pokemon/config.ts}). El esquema
 * es {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record WhoIsWhoPokemonConfig(
    List<Integer> generations,
    int boardSize,
    boolean includeForms,
    int turnSeconds,
    int rounds,
    int selectionSeconds,
    WhoIsWhoSecretSelection secretSelection) {

  /** {@code .default(30)} de {@code selectionSeconds}. */
  static final int DEFAULT_SELECTION_SECONDS = 30;

  private static final Set<String> KEYS = Set.of("generations", "boardSize", "includeForms", "turnSeconds", "rounds",
      "selectionSeconds", "secretSelection");

  public enum WhoIsWhoSecretSelection { RANDOM, PLAYER_CHOICE }

  public WhoIsWhoPokemonConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultWhoIsWhoPokemonConfig}. */
  public static WhoIsWhoPokemonConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new WhoIsWhoPokemonConfig(generations, 24, true, 40, 15, DEFAULT_SELECTION_SECONDS,
        WhoIsWhoSecretSelection.RANDOM);
  }

  /**
   * {@code whoIsWhoPokemonConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code selectionSeconds} ausente vale 30 ({@code null} no es ausente: no valida). Los enteros admiten {@code 10.0}
   * y rechazan {@code 10.5}.
   */
  public static WhoIsWhoPokemonConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Quién es Quién — Pokémon");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int boardSize = config.integer("boardSize", 5, 50);
    boolean includeForms = config.bool("includeForms");
    int turnSeconds = config.integer("turnSeconds", 10, 120);
    int rounds = config.integer("rounds", 1, 25);
    int selectionSeconds =
        config.has("selectionSeconds") ? config.integer("selectionSeconds", 0, 120) : DEFAULT_SELECTION_SECONDS;
    return new WhoIsWhoPokemonConfig(generations, boardSize, includeForms, turnSeconds, rounds, selectionSeconds,
        config.enumValue("secretSelection", WhoIsWhoSecretSelection.class));
  }
}
