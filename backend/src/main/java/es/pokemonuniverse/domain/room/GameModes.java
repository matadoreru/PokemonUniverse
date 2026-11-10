package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexMode;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerMode;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessMode;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceMode;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorMode;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteMode;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelMode;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorMode;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code GAME_MODES} de {@code games/modes.ts}: los juegos con modos de juego y sus modos, en el orden del catálogo
 * ({@code CLASSIC} primero). El campo {@code mode} de otros juegos (p. ej. el de las respuestas de Red Flag) no es un
 * modo de juego: solo cuentan los de esta lista.
 */
public final class GameModes {

  public static final String CLASSIC = "CLASSIC";

  private static final Map<String, List<String>> MODES = new LinkedHashMap<>();

  static {
    MODES.put("pokedex-distance", names(PokedexDistanceMode.values()));
    MODES.put("higher-lower", names(HigherLowerMode.values()));
    MODES.put("shiny-vote", names(ShinyVoteMode.values()));
    MODES.put("learnset-guess", names(LearnsetGuessMode.values()));
    MODES.put("type-duel", names(TypeDuelMode.values()));
    MODES.put("pokemon-impostor", names(PokemonImpostorMode.values()));
    MODES.put("absurd-pokedex", names(AbsurdPokedexMode.values()));
    MODES.put("unown-translator", names(UnownTranslatorMode.values()));
  }

  private GameModes() {}

  private static List<String> names(Enum<?>[] values) {
    return Arrays.stream(values).map(Enum::name).toList();
  }

  /** Los modos de {@code gameId} en el orden del catálogo; vacía si el juego no tiene modos. */
  public static List<String> of(String gameId) {
    return MODES.getOrDefault(gameId, List.of());
  }

  public static boolean hasModes(String gameId) {
    return MODES.containsKey(gameId);
  }

  /** El {@code mode} de la configuración si es un modo del juego; si falta o no lo es, {@code CLASSIC}. */
  public static String configMode(String gameId, @Nullable JsonNode config) {
    var mode = config != null && config.isObject() ? config.get("mode") : null;
    return mode != null && mode.isString() && of(gameId).contains(mode.getStringValue())
        ? mode.getStringValue() : CLASSIC;
  }

  /**
   * Los modos que se juegan de {@code gameId} en la sesión (opciones al azar o por votación, turnos de la cola por
   * orden), en el orden del catálogo: los que eligió el host ({@code explicit}) o, sin elección, el modo de su
   * configuración. Vacía para un juego sin modos.
   */
  public static List<String> allowed(Map<String, List<String>> explicit, String gameId, @Nullable JsonNode config) {
    if (!hasModes(gameId)) return List.of();
    var chosen = explicit.get(gameId);
    if (chosen != null) {
      var valid = of(gameId).stream().filter(chosen::contains).toList();
      if (!valid.isEmpty()) return valid;
    }
    return List.of(configMode(gameId, config));
  }

  /** Copia de {@code config} con {@code mode} cambiado; el resto de ajustes no se toca. */
  public static JsonNode withMode(@Nullable JsonNode config, String mode) {
    var entries = new LinkedHashMap<String, JsonNode>();
    if (config != null && config.isObject()) {
      for (var entry : config.entries()) entries.put(entry.getKey(), entry.getValue());
    }
    entries.put("mode", JsonNode.createStringNode(mode));
    return JsonNode.createObjectNode(entries);
  }
}
