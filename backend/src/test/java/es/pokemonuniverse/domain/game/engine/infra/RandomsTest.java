package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class RandomsTest {

  @Test
  void preservesTheInputAndVisitsEachValueOncePerShuffle() {
    var input = List.of(1, 2, 3, 4);
    assertEquals(List.of(2, 3, 4, 1), Randoms.shuffled(input, () -> 0));
    assertEquals(List.of(1, 2, 3, 4), input);
  }

  @Test
  void shuffleConsumesOneDrawPerIndexAndClampsDrawsOfOne() {
    var draws = new AtomicInteger();
    assertEquals(List.of(1, 2, 3, 4), Randoms.shuffled(List.of(1, 2, 3, 4), () -> {
      draws.incrementAndGet();
      return 1.0;
    }));
    assertEquals(3, draws.get());
    // Secuencia fijada con shuffled() de random.ts y mulberry32(42).
    assertEquals(List.of("a", "e", "c", "b", "d"), Randoms.shuffled(List.of("a", "b", "c", "d", "e"), new Mulberry32(42)));
  }

  @Test
  void refillsFinitePoolsHandlesASingletonAndRejectsAnEmptyPool() {
    var deck = Randoms.contentDeck(List.of("a", "b"), 9, () -> 0, Function.identity());
    assertEquals(9, deck.size());
    for (int i = 1; i < deck.size(); i++) assertNotEquals(deck.get(i - 1), deck.get(i));
    assertEquals(List.of("a", "a", "a"), Randoms.contentDeck(List.of("a"), 3, () -> 0, Function.identity()));
    var empty = assertThrows(IllegalArgumentException.class,
        () -> Randoms.contentDeck(List.<String>of(), 1, () -> 0, Function.identity()));
    assertEquals("Empty content pool", empty.getMessage());
    var negative = assertThrows(IllegalArgumentException.class,
        () -> Randoms.contentDeck(List.of("a"), -1, () -> 0, Function.identity()));
    assertEquals("Invalid deck length", negative.getMessage());
    assertEquals(List.of(), Randoms.contentDeck(List.<String>of(), 0, () -> 0, Function.identity()));
    // Fijado con contentDeck() de random.ts y mulberry32(7).
    assertEquals(List.of("b", "c", "a", "b", "a", "c", "a"),
        Randoms.contentDeck(List.of("a", "b", "c"), 7, new Mulberry32(7), Function.identity()));
  }

  @Test
  void randomItemClampsToTheLastItem() {
    assertEquals("a", Randoms.randomItem(List.of("a", "b", "c"), () -> 0));
    assertEquals("b", Randoms.randomItem(List.of("a", "b", "c"), () -> 0.5));
    assertEquals("c", Randoms.randomItem(List.of("a", "b", "c"), () -> 1.0));
  }

  @Test
  void takeRandomDrawsOncePerTakenItemWithoutReplacementAndStopsWhenThePoolRunsOut() {
    var input = List.of("a", "b", "c", "d");
    var draws = new AtomicInteger();
    // Cada extracción se fija a la posición del medio del pool que queda: 4 → 2, 3 → 1, 2 → 1, 1 → 0.
    assertEquals(List.of("c", "b", "d", "a"), Randoms.takeRandom(input, 9, () -> {
      draws.incrementAndGet();
      return 0.5;
    }));
    assertEquals(4, draws.get());
    assertEquals(List.of("a", "b", "c", "d"), input);
    assertEquals(List.of("d", "c"), Randoms.takeRandom(input, 2, () -> 1.0));
    var sequence = new double[] {0.99, 0.0, 0.5};
    var next = new AtomicInteger();
    assertEquals(List.of("d", "a", "c"), Randoms.takeRandom(input, 3, () -> sequence[next.getAndIncrement()]));
    assertEquals(List.of(), Randoms.takeRandom(input, 0, () -> {
      throw new AssertionError("sin extracciones");
    }));
  }

  @Test
  void randomIndexDrawsOnceEvenForAnEmptyPool() {
    var draws = new AtomicInteger();
    assertEquals(-1, Randoms.randomIndex(0, () -> {
      draws.incrementAndGet();
      return 0.5;
    }));
    assertEquals(1, draws.get());
    assertEquals(0, Randoms.randomIndex(3, () -> 0));
    assertEquals(1, Randoms.randomIndex(3, () -> 0.5));
    assertEquals(2, Randoms.randomIndex(3, () -> 1.0));
  }

  @Test
  void preferUnusedFallsBackToThePoolWithoutDrawing() {
    var pool = List.of("a", "b", "c");
    assertEquals(List.of("a", "c"), Randoms.preferUnused(pool, "b"::equals));
    assertSame(pool, Randoms.preferUnused(pool, value -> true));
    assertEquals(List.of(), Randoms.preferUnused(List.<String>of(), value -> false));
  }
}
