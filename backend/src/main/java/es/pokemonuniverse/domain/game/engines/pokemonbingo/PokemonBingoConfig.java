package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;
import static es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerationOptions.BINGO_FAMILY_KEYS;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerationOptions;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokemonBingoConfigSchema} de {@code pokemon-bingo/config.ts}); la raíz es
 * estricta y {@code families} no: sus claves desconocidas se descartan. {@code families} conserva el orden de
 * {@link ConditionGenerationOptions#BINGO_FAMILY_KEYS}, que es el de la salida de Zod.
 */
@Serdeable
public record PokemonBingoConfig(int width, int height, int durationSeconds, List<Integer> generations,
    int maxConditionsPerCell, Map<String, Boolean> families) {

  private static final Set<String> KEYS =
      Set.of("width", "height", "durationSeconds", "generations", "maxConditionsPerCell", "families");

  /** Familias desactivadas en {@code defaultPokemonBingoConfig}. */
  private static final Set<String> DEFAULT_OFF = Set.of("baseStatTotal", "legendaryStatus", "color", "abilities");

  public PokemonBingoConfig {
    generations = List.copyOf(generations);
    families = frozenMap(families);
  }

  /** {@code config.families[key]}; una clave ausente es {@code undefined} (falso). */
  public boolean family(String key) {
    return Boolean.TRUE.equals(families.get(key));
  }

  /**
   * {@code activeBingoFamilies}: las familias activas en el orden de
   * {@link ConditionGenerationOptions#BINGO_FAMILY_KEYS}.
   */
  public List<String> activeFamilies() {
    return BINGO_FAMILY_KEYS.stream().filter(this::family).toList();
  }

  /** {@code defaultPokemonBingoConfig}. */
  public static PokemonBingoConfig defaults() {
    var generations = ConfigReader.allGenerations();
    var families = new LinkedHashMap<String, Boolean>();
    for (var key : BINGO_FAMILY_KEYS) families.put(key, !DEFAULT_OFF.contains(key));
    return new PokemonBingoConfig(3, 3, 120, generations, 1, families);
  }

  /**
   * {@code pokemonBingoConfigSchema.parse}: {@code generations} sin duplicados y ascendentes;
   * {@code maxConditionsPerCell} es {@code 1} o {@code 2}. Los enteros admiten {@code 3.0} (JS tiene un único tipo
   * numérico) y rechazan {@code 3.5}.
   */
  public static PokemonBingoConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokémon Bingo");
    config.strict(KEYS);
    int width = config.integer("width", 2, 6);
    int height = config.integer("height", 2, 6);
    int durationSeconds = config.integer("durationSeconds", 60, 300);
    var generations = config.generations("generations");
    var maxNode = config.required("maxConditionsPerCell");
    int maxConditionsPerCell = 1;
    if (!maxNode.isNumber() || (maxNode.getDoubleValue() != 1 && maxNode.getDoubleValue() != 2)) {
      config.reject("maxConditionsPerCell", "maxConditionsPerCell debe ser 1 o 2");
    } else {
      maxConditionsPerCell = (int) maxNode.getDoubleValue();
    }
    return new PokemonBingoConfig(width, height, durationSeconds, generations, maxConditionsPerCell,
        families(config.object("families")));
  }

  /**
   * {@code bingoFamiliesSchema}: objeto no estricto con un booleano por familia. Se queda local porque una familia
   * ausente da {@code families.<clave> debe ser booleano}, no el {@code falta <clave>} del lector común.
   */
  private static Map<String, Boolean> families(ConfigReader families) {
    var flags = new LinkedHashMap<String, Boolean>();
    for (var key : BINGO_FAMILY_KEYS) {
      var flag = families.get(key);
      if (flag == null || !flag.isBoolean()) {
        families.reject(key, "families." + key + " debe ser booleano");
        flags.put(key, false);
      } else {
        flags.put(key, flag.getBooleanValue());
      }
    }
    return flags;
  }
}
