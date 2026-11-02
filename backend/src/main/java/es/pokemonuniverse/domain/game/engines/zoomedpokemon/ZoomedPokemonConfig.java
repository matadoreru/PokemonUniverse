package es.pokemonuniverse.domain.game.engines.zoomedpokemon;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code zoomedPokemonConfigSchema} de {@code zoomed-pokemon/config.ts}). El esquema es
 * {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record ZoomedPokemonConfig(
    List<Integer> generations,
    ImageMode imageMode,
    int roundSeconds,
    int rounds,
    boolean hintsEnabled,
    List<HintKind> hintKinds,
    boolean includeForms) {

  /** {@code ZOOMED_POKEMON_IMAGE_MODES}. */
  public enum ImageMode { MIXED, SPRITE, ARTWORK }

  /** {@code ZOOMED_POKEMON_HINT_KINDS}. */
  public enum HintKind { GENERATION, TYPE, TYPE_COUNT, EVOLUTION, CATEGORY }

  private static final Set<String> KEYS = Set.of("generations", "imageMode", "roundSeconds", "rounds",
      "hintsEnabled", "hintKinds", "includeForms");

  public ZoomedPokemonConfig {
    generations = List.copyOf(generations);
    hintKinds = List.copyOf(hintKinds);
  }

  /** {@code defaultZoomedPokemonConfig}. */
  public static ZoomedPokemonConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new ZoomedPokemonConfig(generations, ImageMode.MIXED, 30, 10, false,
        List.of(HintKind.GENERATION, HintKind.TYPE, HintKind.EVOLUTION), true);
  }

  /**
   * {@code zoomedPokemonConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code hintKinds} sin duplicados en orden de aparición ({@code [...new Set(values)]}, sin ordenar). Los enums
   * distinguen mayúsculas y los enteros admiten {@code 15.0} y rechazan {@code 15.5}.
   */
  public static ZoomedPokemonConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Zoomed Pokémon");
    config.strict(KEYS);
    var generations = config.generations("generations");
    var imageMode = enumValue(config, config.required("imageMode"), ImageMode.class, "imageMode");
    int roundSeconds = config.integer("roundSeconds", 15, 60);
    int rounds = config.integer("rounds", 1, 20);
    boolean hintsEnabled = config.bool("hintsEnabled");
    var hintKindsNode = config.required("hintKinds");
    if (!hintKindsNode.isArray()) throw config.invalid("hintKinds debe ser una lista");
    var hintKinds = new LinkedHashSet<HintKind>();
    for (var value : hintKindsNode.values()) hintKinds.add(enumValue(config, value, HintKind.class, "hintKinds"));
    boolean includeForms = config.bool("includeForms");
    return new ZoomedPokemonConfig(generations, imageMode, roundSeconds, rounds, hintsEnabled,
        new ArrayList<>(hintKinds), includeForms);
  }

  /** {@code z.enum([...])}; se queda local porque su mensaje es «no admite ese valor», no el común. */
  private static <E extends Enum<E>> E enumValue(ConfigReader config, JsonNode value, Class<E> type, String key) {
    if (value.isString()) {
      for (var constant : type.getEnumConstants()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw config.invalid(key + " no admite ese valor");
  }
}
