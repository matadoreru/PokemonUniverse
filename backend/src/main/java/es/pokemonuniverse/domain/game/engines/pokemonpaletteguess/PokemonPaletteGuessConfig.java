package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokemonPaletteGuessConfigSchema} de {@code pokemon-palette-guess/config.ts}). El
 * esquema es {@code .strict()}: una clave desconocida invalida la configuración.
 * {@code hintKinds: []} se serializa siempre: con la inclusión {@code NON_EMPTY} de serde desaparecería y el árbol
 * guardado ya no pasaría su propio {@code parse}.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record PokemonPaletteGuessConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    int paletteSize,
    boolean hintsEnabled,
    List<PokemonPaletteHintKind> hintKinds,
    boolean publicAttempts,
    /** Rachas: el segundo acierto seguido suma +1, el tercero +2 y, desde el cuarto, +3 ({@code SpeedPodiumScore}). */
    boolean streakBonus) {

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "rounds", "paletteSize", "hintsEnabled", "hintKinds", "publicAttempts",
          "streakBonus");

  public PokemonPaletteGuessConfig {
    generations = List.copyOf(generations);
    hintKinds = List.copyOf(hintKinds);
  }

  /** {@code POKEMON_PALETTE_HINT_KINDS}. */
  public enum PokemonPaletteHintKind { GENERATION, TYPE, TYPE_COUNT, EVOLUTION, CATEGORY }

  /** {@code defaultPokemonPaletteGuessConfig}. */
  public static PokemonPaletteGuessConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new PokemonPaletteGuessConfig(generations, 25, 10, 8, false, List.of(PokemonPaletteHintKind.GENERATION,
        PokemonPaletteHintKind.TYPE, PokemonPaletteHintKind.EVOLUTION), true, false);
  }

  /**
   * {@code pokemonPaletteGuessConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code hintKinds} (puede estar vacío) sin duplicados en orden de primera aparición.
   */
  public static PokemonPaletteGuessConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Adivina por la Paleta");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    int rounds = config.integer("rounds", 1, 20);
    int paletteSize = config.integer("paletteSize", 5, 8);
    boolean hintsEnabled = config.bool("hintsEnabled");
    var kindsNode = config.required("hintKinds");
    var hintKinds = new LinkedHashSet<PokemonPaletteHintKind>();
    if (!kindsNode.isArray()) {
      config.reject("hintKinds", "hintKinds debe ser una lista");
    } else {
      for (var value : kindsNode.values()) {
        hintKinds.add(config.enumValue(value, "hintKinds", PokemonPaletteHintKind.class));
      }
    }
    var publicAttempts = config.boolOrDefault("publicAttempts", true);
    var streakBonus = config.boolOrDefault("streakBonus", false);
    return new PokemonPaletteGuessConfig(generations, roundSeconds, rounds, paletteSize, hintsEnabled,
        new ArrayList<>(hintKinds), publicAttempts, streakBonus);
  }
}
