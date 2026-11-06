package es.pokemonuniverse.domain.game.engines.pokedexentryguess;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokedexEntryGuessConfigSchema} de {@code pokedex-entry-guess/config.ts}). El
 * esquema es {@code .strict()} en la raíz y en {@code hints}: una clave desconocida en cualquiera de los dos invalida la
 * configuración.
 */
@Serdeable
public record PokedexEntryGuessConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    boolean hintsEnabled,
    PokedexEntryHintConfig hints,
    boolean publicAttempts) {

  private static final Set<String> KEYS = Set.of("generations", "roundSeconds", "rounds", "hintsEnabled", "hints",
      "publicAttempts");

  public PokedexEntryGuessConfig {
    generations = List.copyOf(generations);
  }

  /** {@code pokedexEntryHintConfigSchema}: pistas adicionales (claves de TS, en su orden). */
  @Serdeable
  public record PokedexEntryHintConfig(boolean generation, boolean type, boolean evolution, boolean typeCount,
      boolean category) {

    static final Set<String> KEYS = Set.of("generation", "type", "evolution", "typeCount", "category");

    /** {@code Object.values(value.hints).some(Boolean)}. */
    boolean any() {
      return generation || type || evolution || typeCount || category;
    }

    /** Cada argumento se lee por su clave literal; el orden posicional es el del esquema. */
    static PokedexEntryHintConfig parse(ConfigReader hints) {
      hints.strict(KEYS);
      return new PokedexEntryHintConfig(hints.bool("generation"), hints.bool("type"), hints.bool("evolution"),
          hints.bool("typeCount"), hints.bool("category"));
    }
  }

  /** {@code defaultPokedexEntryGuessConfig}. */
  public static PokedexEntryGuessConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new PokedexEntryGuessConfig(generations, 25, 10, false,
        new PokedexEntryHintConfig(true, true, true, false, false), true);
  }

  /**
   * {@code pokedexEntryGuessConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes y,
   * con {@code hintsEnabled}, al menos una pista ({@code superRefine}, que solo corre si el resto es válido). Los
   * enteros admiten {@code 15.0} y rechazan {@code 15.5}.
   */
  public static PokedexEntryGuessConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokédex Entry Guess");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 15, 60);
    int rounds = config.integer("rounds", 1, 20);
    boolean hintsEnabled = config.bool("hintsEnabled");
    var hints = PokedexEntryHintConfig.parse(config.object("hints"));
    var publicAttempts = config.boolOrDefault("publicAttempts", true);
    if (hintsEnabled && !hints.any()) throw config.invalidAt("hints", "Selecciona al menos una pista adicional");
    return new PokedexEntryGuessConfig(generations, roundSeconds, rounds, hintsEnabled, hints, publicAttempts);
  }
}
