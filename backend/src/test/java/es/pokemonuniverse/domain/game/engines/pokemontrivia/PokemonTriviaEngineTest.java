package es.pokemonuniverse.domain.game.engines.pokemontrivia;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaConfig.PokemonTriviaDifficulty;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaConfig.PokemonTriviaQuestionType;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaOptionId;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo, formato y errores de arranque. */
class PokemonTriviaEngineTest {

  private final PokemonTriviaEngine engine = new PokemonTriviaEngine(GoldenManifests.of(PokemonTriviaEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-trivia", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonTriviaEngine(other));
  }

  @Test
  void parsesTheStrictAnswerAction() throws IOException {
    assertEquals(PokemonTriviaOptionId.D, engine.parseAction(json("{\"type\":\"ANSWER\",\"optionId\":\"D\"}")).optionId());
    for (var invalid : List.of("{\"type\":\"ANSWER\",\"optionId\":\"E\"}", "{\"type\":\"ANSWER\",\"optionId\":\"a\"}",
        "{\"type\":\"ANSWER\",\"optionId\":\"A\",\"extra\":1}", "{\"type\":\"ANSWER\"}",
        "{\"type\":\"GUESS\",\"optionId\":\"A\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** Valores de referencia de {@code (n).toLocaleString('es-ES')} en Node. */
  @Test
  void formatsNumbersLikeSpanishLocaleString() {
    assertEquals("0,7", PokemonTriviaRules.formatEs(0.7));
    assertEquals("46", PokemonTriviaRules.formatEs(46));
    assertEquals("1000", PokemonTriviaRules.formatEs(1000));
    assertEquals("12.345,6", PokemonTriviaRules.formatEs(12345.6));
    assertEquals("1.234.567,891", PokemonTriviaRules.formatEs(1234567.891));
    assertEquals("1,235", PokemonTriviaRules.formatEs(1.2345));
    assertEquals("2,001", PokemonTriviaRules.formatEs(2.0005));
  }

  @Test
  void needsAPoolOfOptionCountAndStartsOnlyOnce() {
    var tiny = new PokemonTriviaConfig(List.of(9), 20, 3, 4, PokemonTriviaDifficulty.NORMAL,
        List.of(PokemonTriviaQuestionType.HP));
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(tiny, context(1)));
    assertEquals("Se necesitan al menos 4 Pokémon en las generaciones seleccionadas.", error.getMessage());
    var context = context(1);
    var started = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
  }

  /** Solo preguntas de generación con una única generación (el superRefine lo impide; aquí se fuerza). */
  @Test
  void throwsWhenNoQuestionCanBeBuilt() {
    var impossible = new PokemonTriviaConfig(List.of(1), 20, 3, 4, PokemonTriviaDifficulty.NORMAL,
        List.of(PokemonTriviaQuestionType.GENERATION));
    var context = context(1);
    var state = engine.createInitialState(impossible, context);
    var error = assertThrows(EngineException.class, () -> engine.start(state, context));
    assertEquals("No hay suficientes datos distintos para crear preguntas con esta configuración.", error.getMessage());
  }
}
