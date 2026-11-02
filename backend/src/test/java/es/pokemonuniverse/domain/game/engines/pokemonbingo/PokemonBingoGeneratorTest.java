package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoConditionTemplate;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoDifficulty;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.DoubleSupplier;
import org.junit.jupiter.api.Test;

/**
 * Generador con extracciones guionizadas. Los valores esperados salen de ejecutar una vez el generador TS
 * ({@code buildBingoConditionTemplates} y {@code generateBingoBoard} del dist de shared) con el mismo guion sobre el
 * catálogo dorado gen1-2: comprueban las plantillas, el cartón y cuántas veces se consume {@code random}.
 */
class PokemonBingoGeneratorTest {

  private static final double[] SCRIPT = {0.1, 0.5, 0.9, 0.3, 0.7, 0.05, 0.95};

  /** Repite {@link #SCRIPT} y cuenta las extracciones. */
  private static final class ScriptedRandom implements DoubleSupplier {
    private int draws;

    @Override
    public double getAsDouble() {
      return SCRIPT[draws++ % SCRIPT.length];
    }
  }

  private static final List<Pokemon> GEN1 = GoldenCatalogs.load("gen1-2").forGenerations(List.of(1));

  private static PokemonBingoConfig config(int maxConditions) {
    var defaults = PokemonBingoConfig.defaults();
    return new PokemonBingoConfig(3, 3, 120, List.of(1), maxConditions, defaults.families());
  }

  @Test
  void combinationsShuffleTheSinglesAndBoardsDrawOncePerCellAndAttempt() {
    var random = new ScriptedRandom();
    var templates = PokemonBingoGenerator.buildBingoConditionTemplates(GEN1, config(2), random);
    assertEquals(208, templates.size());
    assertEquals(108, templates.stream().filter(template -> template.conditions().size() == 2).count());
    assertEquals(99, random.draws);
    assertEquals("GEN:1", templates.getFirst().key());
    BingoConditionTemplate last = templates.getLast();
    assertEquals("STAT:attack:LT:76&STAT:specialDefense:LT:70", last.key());
    assertEquals(BingoDifficulty.EASY, last.difficulty());
    assertEquals(56, last.candidatePokemonIds().size());

    var board = PokemonBingoGenerator.generateBingoBoard(templates, GEN1, 3, 3, random, Set.of(), 97);
    assertEquals("STAT:attack:GT:72&TYPES:fire+flying|STAT:specialDefense:GT:60|DEX:GT:76:"
        + "|PHYSICAL:weightHectograms:GT:620&STAT:attack:GT:72|PHYSICAL:weightHectograms:GT:200"
        + "|PHYSICAL:heightDecimeters:LT:8|PHYSICAL:weightHectograms:LT:200&STAT:attack:GT:72|TYPE:electric"
        + "|PHYSICAL:heightDecimeters:LT:17", board.signature());
    assertEquals(108, random.draws);
    assertEquals(Map.of("cell-4", "charizard", "cell-8", "pikachu", "cell-7", "raticate", "cell-5", "venusaur",
        "cell-9", "bulbasaur", "cell-3", "ponyta", "cell-6", "charmander", "cell-1", "moltres", "cell-2", "ivysaur"),
        board.solutionPokemonIds());

    // Una firma prohibida descarta el intento (sus nueve extracciones ya se han consumido) y cambia la sal.
    var again = PokemonBingoGenerator.generateBingoBoard(templates, GEN1, 3, 3, random, Set.of(board.signature()), 97);
    assertEquals("STAT:specialDefense:LT:70&TYPES:rock+water|STAT:attack:LT:64|PHYSICAL:heightDecimeters:GT:12"
        + "|STAT:attack:GT:72&STAT:speed:GT:85|PHYSICAL:weightHectograms:LT:200|STAT:attack:GT:83"
        + "|DEX:LT:53:&STAT:attack:GT:72|TYPES:grass+psychic|STAT:specialDefense:LT:61", again.signature());
    assertEquals(117, random.draws);
  }

  @Test
  void singleConditionTemplatesDoNotDraw() {
    var random = new ScriptedRandom();
    assertEquals(100, PokemonBingoGenerator.buildBingoConditionTemplates(GEN1, config(1), random).size());
    assertEquals(0, random.draws);
  }

  @Test
  void rejectsBoardsWithoutEnoughConditionsOrAPerfectMatching() {
    var catalog = GoldenCatalogs.load("gen1-2");
    var tiny = List.of(catalog.byId("bulbasaur").orElseThrow(), catalog.byId("ivysaur").orElseThrow());
    var random = new ScriptedRandom();
    var templates = PokemonBingoGenerator.buildBingoConditionTemplates(tiny, config(1), random);
    assertEquals(List.of("GEN:1", "TYPE:grass", "TYPE:poison", "TYPES:grass+poison", "TYPE_COUNT:2"),
        templates.stream().map(BingoConditionTemplate::key).toList());

    var unsolvable = assertThrows(EngineException.class,
        () -> PokemonBingoGenerator.generateBingoBoard(templates, tiny, 2, 2, random, Set.of(), 0));
    assertEquals("No se puede generar un tablero 2×2 globalmente resoluble con esta configuración. Activa más "
        + "generaciones o familias de condiciones.", unsolvable.getMessage());
    assertEquals(2_000, random.draws);

    var few = assertThrows(EngineException.class,
        () -> PokemonBingoGenerator.generateBingoBoard(templates.subList(0, 3), tiny, 2, 2, random, Set.of(), 0));
    assertEquals("No se puede generar un tablero 2×2: solo hay 3 condiciones distintas válidas.", few.getMessage());
  }
}
