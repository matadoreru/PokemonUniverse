package es.pokemonuniverse.domain.game.engines.pokeddlerace;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Configuración normalizada ({@code pokeddleRaceConfigSchema} de {@code pokeddle-race/config.ts}). La raíz es
 * {@code .strict()}; {@code clues} no lo es: exige las 17 pistas booleanas y descarta las claves desconocidas.
 * {@code clues} es un mapa en el orden de {@code POKEDDLE_CLUE_KEYS}, que es el orden en que Zod emite la salida.
 */
@Serdeable
public record PokeddleRaceConfig(List<Integer> generations, int roundSeconds, int maxRounds, Map<String, Boolean> clues) {

  /** {@code POKEDDLE_CLUE_KEYS}, en su orden. */
  public static final List<String> CLUE_KEYS = List.of(
      "generation", "dexNumber", "types", "typeCount",
      "hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal",
      "height", "weight", "evolutionStage", "legendaryStatus", "color", "abilities");

  private static final Set<String> KEYS = Set.of("generations", "roundSeconds", "maxRounds", "clues");

  public PokeddleRaceConfig {
    generations = List.copyOf(generations);
    clues = frozenMap(clues);
  }

  /** {@code config.clues[key]}. */
  public boolean clue(String key) {
    return Boolean.TRUE.equals(clues.get(key));
  }

  /** {@code activePokeddleClues}: las pistas activas en el orden de {@code POKEDDLE_CLUE_KEYS}. */
  public List<String> activeClues() {
    return CLUE_KEYS.stream().filter(this::clue).toList();
  }

  /** {@code defaultPokeddleRaceConfig}. */
  public static PokeddleRaceConfig defaults() {
    var generations = ConfigReader.allGenerations();
    var disabled = Set.of("baseStatTotal", "legendaryStatus", "color", "abilities");
    var clues = new LinkedHashMap<String, Boolean>();
    for (var key : CLUE_KEYS) clues.put(key, !disabled.contains(key));
    return new PokeddleRaceConfig(generations, 20, 10, clues);
  }

  /**
   * {@code pokeddleRaceConfigSchema.parse}: raíz estricta; {@code generations} sin duplicados y ascendentes. Los enteros
   * admiten {@code 20.0} (JS tiene un único tipo numérico) y rechazan {@code 20.5}.
   */
  public static PokeddleRaceConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokédle Race");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    int maxRounds = config.integer("maxRounds", 1, 30);
    var cluesNode = config.object("clues");
    var clues = new LinkedHashMap<String, Boolean>();
    for (var key : CLUE_KEYS) {
      var value = cluesNode.required(key);
      if (!value.isBoolean()) {
        cluesNode.reject(key, "clues." + key + " debe ser booleano");
        clues.put(key, false);
      } else {
        clues.put(key, value.getBooleanValue());
      }
    }
    return new PokeddleRaceConfig(generations, roundSeconds, maxRounds, clues);
  }
}
