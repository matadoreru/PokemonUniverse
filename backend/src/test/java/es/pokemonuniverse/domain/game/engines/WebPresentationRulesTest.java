package es.pokemonuniverse.domain.game.engines;

import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessRules;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToRules;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeRules;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagRules;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooRules;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonRules;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerRules;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelRules;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonRules;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherRules;
import es.pokemonuniverse.golden.WebContracts;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Reglas de los motores que la web repite para explicar la puntuación (constantes de los {@code rules.ts} de shared y
 * {@code learnsetPoints}, {@code learnsetManualRevealPoints} y {@code normalizeTabooText}). Graba
 * {@code web-contracts/presentation-rules.json}, que lee {@code packages/shared/src/games/presentation-rules.test.ts}.
 */
class WebPresentationRulesTest {

  @Test
  void matchesTheWebContract() throws IOException {
    var rules = new LinkedHashMap<String, Object>();
    rules.put("learnset-guess", learnsetGuess());
    rules.put("most-likely-to", Map.of("winPoints", MostLikelyToRules.WIN_POINTS));
    rules.put("one-of-us-is-fake", ordered("normalRoundPoints", OneOfUsIsFakeRules.NORMAL_ROUND_POINTS,
        "fakeRoundPoints", OneOfUsIsFakeRules.FAKE_ROUND_POINTS));
    rules.put("poke-taboo", pokeTaboo());
    rules.put("pokemon-red-flag", Map.of("winPoints", PokemonRedFlagRules.WIN_POINTS));
    var sketchmon = new LinkedHashMap<String, Object>();
    sketchmon.put("drawerPoints", SketchmonRules.DRAWER_POINTS);
    sketchmon.put("guesserMaxPoints", SketchmonRules.guesserPoints(0));
    sketchmon.put("guesserMinPoints", SketchmonRules.guesserPoints(Long.MAX_VALUE));
    rules.put("sketchmon", sketchmon);
    rules.put("tcg-higher-lower", ordered("samePoints", TcgHigherLowerRules.SAME_POINTS,
        "correctPoints", TcgHigherLowerRules.CORRECT_POINTS));
    rules.put("type-duel", Map.of("maxInvalidCombinations", TypeDuelRules.TYPE_DUEL_MAX_INVALID_COMBINATIONS));
    rules.put("who-is-who-pokemon", Map.of("winPoints", WhoIsWhoPokemonRules.WIN_POINTS));
    rules.put("would-you-rather", ordered("majorityPoints", WouldYouRatherRules.MAJORITY_POINTS,
        "predictionPoints", WouldYouRatherRules.PREDICTION_POINTS));
    WebContracts.check("presentation-rules.json", rules);
  }

  /** Dos claves en este orden ({@code Map.of} no lo conserva). */
  private static Map<String, Object> ordered(String firstKey, Object first, String secondKey, Object second) {
    var out = new LinkedHashMap<String, Object>();
    out.put(firstKey, first);
    out.put(secondKey, second);
    return out;
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
