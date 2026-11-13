package es.pokemonuniverse.domain.game.engines.oddoneout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutBoards.Board;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CategoryDefinition;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class OddOneOutBoardsTest {

  private static final InMemoryPokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");
  private static final List<Pokemon> POOL = OddOneOutBoards.pool(List.of(1, 2), GOLDEN);
  private static final Function<String, String> LINES = PokemonConnectionsCatalog.evolutionLines(GOLDEN);

  private static Board board(long seed) {
    return OddOneOutBoards.generate(POOL, Set.of(), Set.of(), LINES, new Random(seed)::nextDouble);
  }

  private static Map<String, Pokemon> byId(List<Pokemon> pool) {
    var map = new HashMap<String, Pokemon>();
    pool.forEach(pokemon -> map.put(pokemon.id(), pokemon));
    return map;
  }

  private static CategoryDefinition definition(String id, List<Pokemon> pool) {
    return PokemonConnectionsCatalog.resolvedCategoryDefinitions(pool).stream()
        .filter(candidate -> candidate.id().equals(id)).findFirst().orElseThrow();
  }

  private static Pokemon intruder(Board board) {
    var option = board.options().stream().filter(o -> o.id().equals(board.intruderOptionId())).findFirst().orElseThrow();
    return byId(POOL).get(option.pokemonId());
  }

  private static List<Pokemon> members(Board board) {
    var pokemon = byId(POOL);
    return board.options().stream().filter(o -> !o.id().equals(board.intruderOptionId()))
        .map(o -> pokemon.get(o.pokemonId())).toList();
  }

  @Test
  void boardHasFourDistinctPokemonAndOneIntruder() {
    var board = board(11);
    assertEquals(List.of("A", "B", "C", "D"), board.options().stream().map(o -> o.id()).toList());
    assertEquals(4, new HashSet<>(board.pokemonIds()).size());
    assertEquals(board.options().stream().map(o -> o.pokemonId()).toList(), board.pokemonIds());
    var category = definition(board.category().id(), POOL);
    assertEquals(category.label(), board.category().label());
    assertEquals(category.explanation(), board.category().explanation());
    assertTrue(members(board).stream().allMatch(category::includes));
    assertFalse(category.includes(intruder(board)));
    var option = board.options().getFirst();
    var pokemon = byId(POOL).get(option.pokemonId());
    assertEquals(pokemon.name(), option.pokemonName());
    assertEquals(pokemon.sprite(), option.sprite());
  }

  @Test
  void boardsHaveNoAlternativeAnswer() {
    var definitions = PokemonConnectionsCatalog.resolvedCategoryDefinitions(POOL);
    for (long seed = 0; seed < 200; seed++) {
      var board = board(seed);
      var category = definition(board.category().id(), POOL);
      assertTrue(OddOneOutBoards.isDistinctive(category, POOL), board.category().id());
      var intruder = intruder(board);
      var members = members(board);
      for (var other : definitions) {
        if (other.id().equals(category.id()) || !OddOneOutBoards.isDistinctive(other, POOL)) continue;
        if (!other.includes(intruder)) continue;
        long shared = members.stream().filter(other::includes).count();
        assertTrue(shared < 2, "semilla " + seed + ": " + intruder.id() + " y " + shared + " miembros en " + other.id()
            + " (categoría " + category.id() + ")");
      }
    }
  }

  @Test
  void legendariesAreNotTheUsualIntruder() {
    int legendary = 0;
    for (long seed = 0; seed < 200; seed++) {
      if (!"NORMAL".equals(intruder(board(seed)).legendaryStatus())) legendary++;
    }
    assertTrue(legendary * 100 < 15 * 200, legendary + " de 200 intrusos son legendarios o singulares");
  }

  @Test
  void curatedCategoryIntruderSharesNoType() {
    int curated = 0;
    for (long seed = 0; seed < 200; seed++) {
      var board = board(seed);
      if (PokemonConnectionsCatalog.isDataCategory(board.category().id())) continue;
      curated++;
      var intruder = intruder(board);
      for (var member : members(board)) {
        assertTrue(member.types().stream().noneMatch(intruder.types()::contains),
            board.category().id() + ": " + intruder.id() + " comparte tipo con " + member.id());
      }
    }
    assertTrue(curated > 0);
  }

  @Test
  void categoriesDoNotRepeatWhileOthersRemain() {
    var random = new Random(5);
    var usedCategories = new HashSet<String>();
    var usedPokemon = new HashSet<String>();
    for (int round = 0; round < 30; round++) {
      var board = OddOneOutBoards.generate(POOL, usedCategories, usedPokemon, LINES, random::nextDouble);
      assertTrue(usedCategories.add(board.category().id()), "categoría repetida: " + board.category().id());
      usedPokemon.addAll(board.pokemonIds());
    }
  }

  @Test
  void noTwoPokemonOfTheSameLine() {
    // El catálogo dorado trae aristas evolutivas: si no, cada Pokémon sería su propia línea y el test no probaría nada.
    assertEquals(LINES.apply("bulbasaur"), LINES.apply("venusaur"));
    for (long seed = 0; seed < 200; seed++) {
      var board = board(seed);
      var lines = board.pokemonIds().stream().map(LINES).distinct().count();
      assertEquals(4, lines, "semilla " + seed + ": " + board.pokemonIds());
    }
  }

  @Test
  void sameSeedSameBoard() {
    assertEquals(board(42), board(42));
    assertNotEquals(board(42), board(43));
  }

  @Test
  void smallPoolsEitherWorkOrAreRejected() {
    for (var generation : List.of(1, 2)) {
      var pool = OddOneOutBoards.pool(List.of(generation), GOLDEN);
      if (OddOneOutBoards.availabilityIssue(pool, LINES).isPresent()) continue;
      var random = new Random(generation);
      var usedCategories = new HashSet<String>();
      var usedPokemon = new HashSet<String>();
      for (int round = 0; round < 30; round++) {
        var board = OddOneOutBoards.generate(pool, usedCategories, usedPokemon, LINES, random::nextDouble);
        usedCategories.add(board.category().id());
        usedPokemon.addAll(board.pokemonIds());
      }
    }
    var tiny = POOL.subList(0, 3);
    var literal = "No hay categorías suficientes en esas generaciones.";
    assertEquals(Optional.of(literal), OddOneOutBoards.availabilityIssue(tiny, LINES));
    var error = assertThrows(EngineException.class,
        () -> OddOneOutBoards.generate(tiny, Set.of(), Set.of(), LINES, new Random(1)::nextDouble));
    assertEquals(literal, error.getMessage());
  }
}
