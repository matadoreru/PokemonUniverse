package es.pokemonuniverse.domain.game.engines.pokemoncryquiz;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokemonCryQuizConfigSchema} de {@code pokemon-cry-quiz/config.ts}). El esquema es
 * {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record PokemonCryQuizConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    CryVersionMode cryVersion,
    boolean includeRegionalForms,
    boolean publicAttempts,
    /** Rachas: el segundo acierto seguido suma +1, el tercero +2 y, desde el cuarto, +3 ({@code SpeedPodiumScore}). */
    boolean streakBonus) {

  /** {@code z.enum(['LATEST', 'LEGACY', 'RANDOM'])}. */
  public enum CryVersionMode { LATEST, LEGACY, RANDOM }

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "rounds", "cryVersion", "includeRegionalForms", "publicAttempts",
          "streakBonus");

  public PokemonCryQuizConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokemonCryQuizConfig}. */
  public static PokemonCryQuizConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new PokemonCryQuizConfig(generations, 20, 10, CryVersionMode.LATEST, false, true, false);
  }

  /**
   * {@code pokemonCryQuizConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes
   * ({@code pokemonGenerationsSchema}); {@code cryVersion} distingue mayúsculas. Los enteros admiten {@code 10.0} y
   * rechazan {@code 10.5}.
   */
  public static PokemonCryQuizConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Adivina el Grito");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    int rounds = config.integer("rounds", 1, 20);
    var cryVersion =
        config.enumValue("cryVersion", CryVersionMode.class, "cryVersion debe ser LATEST, LEGACY o RANDOM");
    boolean includeRegionalForms = config.bool("includeRegionalForms");
    var publicAttempts = config.boolOrDefault("publicAttempts", true);
    var streakBonus = config.boolOrDefault("streakBonus", false);
    return new PokemonCryQuizConfig(generations, roundSeconds, rounds, cryVersion, includeRegionalForms,
        publicAttempts, streakBonus);
  }
}
