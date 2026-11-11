package es.pokemonuniverse.domain.game.engines.unowntranslator;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownToken;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class UnownTranslatorRulesTest {

  /** {@code InMemoryPokemonCatalog} es un {@code LearnsetPokemonCatalog}, como el que usan los tests de Learnset. */
  private static final InMemoryPokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");
  private static final List<Integer> KEY = List.of(5, 9, 0, 3, 7, 1, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18,
      19, 20, 21, 22, 23, 24, 25);

  private static UnownTranslatorConfig config(UnownTranslatorMode mode, int rounds, List<Integer> generations) {
    return new UnownTranslatorConfig(generations, rounds, 60, 6, mode);
  }

  private static void assertInvalid(String text) {
    assertThrows(ConfigValidationException.class, () -> UnownTranslatorConfig.parse(json(text)), text);
  }

  @Test
  void parsesTheStrictConfigWithItsLimits() throws IOException {
    var parsed = UnownTranslatorConfig.parse(json(
        "{\"generations\":[2,1],\"rounds\":10.0,\"roundSeconds\":120,\"hintSeconds\":15}"));
    assertEquals(List.of(1, 2), parsed.generations());
    assertEquals(10, parsed.rounds());
    assertEquals(120, parsed.roundSeconds());
    assertEquals(15, parsed.hintSeconds());
    assertEquals(UnownTranslatorMode.CLASSIC, parsed.mode());
    assertEquals(UnownTranslatorMode.MOVES, UnownTranslatorConfig.parse(json(
        "{\"generations\":[1],\"rounds\":1,\"roundSeconds\":30,\"hintSeconds\":3,\"mode\":\"MOVES\"}")).mode());
    assertEquals(new UnownTranslatorConfig(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9), 5, 60, 6, UnownTranslatorMode.CLASSIC),
        UnownTranslatorConfig.defaults());
    var base = "\"generations\":[1],";
    assertInvalid("{" + base + "\"rounds\":10.5,\"roundSeconds\":60,\"hintSeconds\":6}");
    assertInvalid("{" + base + "\"rounds\":0,\"roundSeconds\":60,\"hintSeconds\":6}");
    assertInvalid("{" + base + "\"rounds\":11,\"roundSeconds\":60,\"hintSeconds\":6}");
    assertInvalid("{" + base + "\"rounds\":5,\"roundSeconds\":29,\"hintSeconds\":6}");
    assertInvalid("{" + base + "\"rounds\":5,\"roundSeconds\":121,\"hintSeconds\":6}");
    assertInvalid("{" + base + "\"rounds\":5,\"roundSeconds\":60,\"hintSeconds\":2}");
    assertInvalid("{" + base + "\"rounds\":5,\"roundSeconds\":60,\"hintSeconds\":16}");
    assertInvalid("{" + base + "\"rounds\":5,\"roundSeconds\":60,\"hintSeconds\":6,\"mode\":\"POKEMON\"}");
    assertInvalid("{" + base + "\"rounds\":5,\"roundSeconds\":60,\"hintSeconds\":6,\"extra\":true}");
  }

  @Test
  void parsesTheGuessActionStrictly() throws IOException {
    var guess = UnownTranslatorTypes.UnownTranslatorAction.parse(json("{\"type\":\"GUESS_UNOWN\",\"text\":\"  Mr. Mime \"}"));
    assertEquals(new UnownTranslatorTypes.UnownTranslatorAction.Guess("Mr. Mime"), guess);
    var empty = assertThrows(ConfigValidationException.class,
        () -> UnownTranslatorTypes.UnownTranslatorAction.parse(json("{\"type\":\"GUESS_UNOWN\",\"text\":\"  \"}")));
    assertEquals("Escribe una respuesta antes de enviarla.", empty.getMessage());
    var tooLong = assertThrows(ConfigValidationException.class, () -> UnownTranslatorTypes.UnownTranslatorAction
        .parse(json("{\"type\":\"GUESS_UNOWN\",\"text\":\"" + "a".repeat(41) + "\"}")));
    assertEquals("La respuesta no puede superar 40 caracteres.", tooLong.getMessage());
    var extra = assertThrows(ConfigValidationException.class, () -> UnownTranslatorTypes.UnownTranslatorAction
        .parse(json("{\"type\":\"GUESS_UNOWN\",\"text\":\"a\",\"x\":1}")));
    assertEquals("Acción de Traductor Unown no válida.", extra.getMessage());
  }

  @Test
  void normalizeStripsAccentsAndKeepsLiterals() {
    assertEquals("PUNO FUEGO", UnownTranslatorRules.normalize("Puño Fuego"));
    assertEquals("NIDORAN♀", UnownTranslatorRules.normalize("Nidoran♀"));
    assertEquals("MR. MIME", UnownTranslatorRules.normalize("Mr. Mime"));
  }

  @Test
  void matchesIgnoresCaseAccentsSpacesAndSigns() {
    assertTrue(UnownTranslatorRules.matches("mr mime", "MR. MIME"));
    assertTrue(UnownTranslatorRules.matches(" puño  fuego ", "PUNO FUEGO"));
    assertTrue(UnownTranslatorRules.matches("farfetchd", "FARFETCH'D"));
    assertTrue(UnownTranslatorRules.matches("pokémon", "POKEMON"));
    assertFalse(UnownTranslatorRules.matches("pikach", "PIKACHU"));
  }

  @Test
  void tokensHideUnknownLettersAndKeepLiterals() {
    var tokens = UnownTranslatorRules.tokens("PIKA-2", KEY, List.of("P"));
    assertEquals(List.of(
        new UnownToken.Letter(KEY.get('P' - 'A'), "P"),
        new UnownToken.Glyph(KEY.get('I' - 'A')),
        new UnownToken.Glyph(KEY.get('K' - 'A')),
        new UnownToken.Glyph(KEY.get('A' - 'A')),
        new UnownToken.Literal("-"),
        new UnownToken.Literal("2")), tokens);
    assertEquals("LETTER", tokens.getFirst().kind());
    assertEquals(6, UnownTranslatorRules.letterCount("MR. MIME"));
  }

  @Test
  void pointsCountHiddenPositions() {
    assertEquals(2, UnownTranslatorRules.hiddenLetters("PIPI", List.of("P")));
    assertEquals(3, UnownTranslatorRules.solvePoints(UnownTranslatorRules.hiddenLetters("PIPI", List.of("P"))));
    assertEquals(0, UnownTranslatorRules.hiddenLetters("PIPI", List.of("P", "I")));
    assertEquals(1, UnownTranslatorRules.solvePoints(0));
    assertEquals(List.of("I", "K"), UnownTranslatorRules.hiddenDistinctLetters("PIKA-KI", List.of("P", "A")));
  }

  @Test
  void decksKeepOnlyMessagesWithThreeLetters() {
    var generations = List.of(1, 2);
    var pokemon = UnownTranslatorRules.pokemonDeck(config(UnownTranslatorMode.CLASSIC, 5, generations), GOLDEN);
    assertFalse(pokemon.isEmpty());
    assertTrue(pokemon.stream().allMatch(message -> UnownTranslatorRules.letterCount(message.normalized()) >= 3));
    assertTrue(pokemon.stream().allMatch(message -> message.pokemon() != null && message.move() == null));
    var moves = UnownTranslatorRules.moveDeck(config(UnownTranslatorMode.MOVES, 5, generations), GOLDEN);
    assertFalse(moves.isEmpty());
    assertTrue(moves.stream().allMatch(message -> UnownTranslatorRules.letterCount(message.normalized()) >= 3));
    assertTrue(moves.stream().allMatch(message -> message.pokemon() == null && message.move() != null));
    assertEquals(moves.size(), new HashSet<>(moves.stream().map(message -> message.normalized()).toList()).size());
  }

  @Test
  void availabilityNeedsAsManyPokemonAsRounds() {
    var generations = List.of(1, 2);
    int usable = UnownTranslatorRules.pokemonDeck(config(UnownTranslatorMode.CLASSIC, 5, generations), GOLDEN).size();
    assertTrue(usable >= 5);
    // El límite exacto: N rondas con N Pokémon utilizables sí, N + 1 no.
    assertEquals(Optional.empty(),
        UnownTranslatorRules.availabilityIssue(config(UnownTranslatorMode.CLASSIC, usable, generations), GOLDEN));
    assertEquals(Optional.of("Solo hay " + usable + " Pokémon en esas generaciones."),
        UnownTranslatorRules.availabilityIssue(config(UnownTranslatorMode.CLASSIC, usable + 1, generations), GOLDEN));
    var none = UnownTranslatorRules.availabilityIssue(config(UnownTranslatorMode.CLASSIC, 5, List.of(9)), GOLDEN);
    assertEquals(Optional.of("Solo hay 0 Pokémon en esas generaciones."), none);
  }

  @Test
  void movesNeedALearnsetCatalog() {
    var moves = config(UnownTranslatorMode.MOVES, 5, List.of(1, 2));
    assertEquals(Optional.empty(), UnownTranslatorRules.availabilityIssue(moves, GOLDEN));
    PokemonCatalog plain = new PokemonCatalog() {
      @Override public List<Pokemon> all() { return GOLDEN.all(); }

      @Override public Optional<Pokemon> byId(String id) { return GOLDEN.byId(id); }

      @Override public Optional<Pokemon> byDexNumber(int number) { return GOLDEN.byDexNumber(number); }

      @Override public List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms) {
        return GOLDEN.forGenerations(generations, includeForms);
      }
    };
    var message = "No hay movimientos disponibles en esas generaciones.";
    assertEquals(Optional.of(message), UnownTranslatorRules.availabilityIssue(moves, plain));
    assertEquals(Optional.of(message),
        UnownTranslatorRules.availabilityIssue(config(UnownTranslatorMode.MOVES, 5, List.of(9)), GOLDEN));
  }
}
