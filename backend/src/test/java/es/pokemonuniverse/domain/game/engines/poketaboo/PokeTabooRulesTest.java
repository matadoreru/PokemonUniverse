package es.pokemonuniverse.domain.game.engines.poketaboo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Tabla fija de pistas prohibidas sin nombres en otros idiomas. Es la misma que comprueba
 * {@code frontend/src/games/poke-taboo/presentation.test.ts} con {@code tabooHintProblem}: si cambia aquí, cambia allí.
 */
class PokeTabooRulesTest {

  private static Pokemon pokemon(String id, String name) {
    return new Pokemon(id, 1, name, 1, true, "s", null, null, null, 1, 1, 1, 1, 1, 1, 6, 1, 1, 1, 1, "NORMAL", null,
        List.of(), Map.of(), List.of("normal"));
  }

  @Test
  void rejectsExactlyTheHintsOfTheSharedTable() {
    var rejected = new LinkedHashMap<Pokemon, List<String>>();
    rejected.put(pokemon("lucario", "Lucario"), List.of("Es como LUCARIO pero azul", "lu ca rio", "superlucariomax"));
    rejected.put(pokemon("vulpix-alola", "Vulpix de Alola"),
        List.of("Un zorro de hielo, como vulpix", "vulpix alola", "vulpixalola"));
    rejected.put(pokemon("mr-mime", "Mr. Mime"), List.of("mr. mime hace mimo", "mrmime"));
    rejected.put(pokemon("tauros-paldea-aqua-breed", "Tauros de Paldea (raza acuática)"),
        List.of("Un tauros que nada", "TAUROS!!", "tauros paldea aqua breed"));
    rejected.put(pokemon("zigzagoon-galar", "Zigzagoon de Galar"),
        List.of("zigzagoon corre en zigzag", "zigzagoon galar"));
    rejected.put(pokemon("ho-oh", "Ho-Oh"), List.of("Ho Oh vuela", "hooh"));
    rejected.put(pokemon("farfetchd", "Farfetch'd"), List.of("farfetchd con puerro", "farfetch'd"));
    var allowedEverywhere = List.of("Siente el aura de los demás", "Un pájaro arcoíris", "Toro de agua", "   ",
        "zig zag", "mime");
    var hints = new ArrayList<String>();
    rejected.values().forEach(hints::addAll);
    hints.addAll(allowedEverywhere);
    for (var entry : rejected.entrySet()) {
      for (var hint : hints) {
        assertEquals(entry.getValue().contains(hint), PokeTabooRules.containsTabooPokemonName(hint, entry.getKey()),
            entry.getKey().id() + " · «" + hint + "»");
      }
    }
  }
}
