package es.pokemonuniverse.domain.game.engines;

import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessRules;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooRules;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonRules;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelRules;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonRules;
import es.pokemonuniverse.golden.WebContracts;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Reglas de los motores que la web repite para explicar la puntuación (constantes de {@code rules.ts} de shared y
 * {@code learnsetPoints}, {@code learnsetManualRevealPoints} y {@code normalizeTabooText}). Graba
 * {@code web-contracts/presentation-rules.json}, que lee {@code packages/shared/src/games/presentation-rules.test.ts}.
 */
class WebPresentationRulesTest {

  @Test
  void matchesTheWebContract() throws IOException {
    var rules = new LinkedHashMap<String, Object>();
    rules.put("learnset-guess", learnsetGuess());
    rules.put("poke-taboo", pokeTaboo());
    var sketchmon = new LinkedHashMap<String, Object>();
    sketchmon.put("drawerPoints", SketchmonRules.DRAWER_POINTS);
    sketchmon.put("guesserMaxPoints", SketchmonRules.guesserPoints(0));
    sketchmon.put("guesserMinPoints", SketchmonRules.guesserPoints(Long.MAX_VALUE));
    rules.put("sketchmon", sketchmon);
    rules.put("type-duel", Map.of("maxInvalidCombinations", TypeDuelRules.TYPE_DUEL_MAX_INVALID_COMBINATIONS));
    rules.put("who-is-who-pokemon", Map.of("winPoints", WhoIsWhoPokemonRules.WIN_POINTS));
    WebContracts.check("presentation-rules.json", rules);
  }

  private static Map<String, Object> learnsetGuess() {
    var out = new LinkedHashMap<String, Object>();
    out.put("initialPoints", LearnsetGuessRules.LEARNSET_INITIAL_POINTS);
    out.put("minPoints", LearnsetGuessRules.LEARNSET_MIN_POINTS);
    out.put("orderBonuses", LearnsetGuessRules.ORDER_BONUSES);
    // Clave «revealStage,solveOrder».
    var points = new LinkedHashMap<String, Integer>();
    for (int stage = 0; stage <= 6; stage++) {
      for (int order = 1; order <= 4; order++) {
        points.put(stage + "," + order, LearnsetGuessRules.learnsetPoints(stage, order));
      }
    }
    out.put("learnsetPoints", points);
    // Clave «totalGroups,visibleGroups».
    var manual = new LinkedHashMap<String, Integer>();
    for (int total = 1; total <= 6; total++) {
      for (int visible = 1; visible <= total + 1; visible++) {
        manual.put(total + "," + visible, LearnsetGuessRules.manualRevealPoints(total, visible));
      }
    }
    out.put("learnsetManualRevealPoints", manual);
    return out;
  }

  private static Map<String, Object> pokeTaboo() {
    var out = new LinkedHashMap<String, Object>();
    out.put("guesserMaxPoints", PokeTabooRules.GUESSER_MAX_POINTS);
    out.put("guesserMinPoints", PokeTabooRules.GUESSER_MIN_POINTS);
    out.put("descriptorPoints", PokeTabooRules.DESCRIPTOR_POINTS);
    var normalized = new LinkedHashMap<String, String>();
    for (var text : List.of("Pokémon", "  Mr. Mime!! ", "Farfetch'd", "ÑANDÚ  pequeño", "Porygon-Z 2", "Ho-Oh",
        "Nidoran♀", "Flabébé", "Type: Null")) {
      normalized.put(text, PokeTabooRules.normalizeTabooText(text));
    }
    out.put("normalizeTabooText", normalized);
    return out;
  }
}
