package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class PromptDeckTest {

  @Test
  void prefersUnusedPromptsAndStartsANewCycleWhenThePoolRunsOut() {
    var pool = List.of("a", "b", "c");
    var draws = new AtomicInteger();
    var first = PromptDeck.choose(pool, List.of("a"), Function.identity(), () -> {
      draws.incrementAndGet();
      return 0.99;
    });
    assertEquals(new PromptDeck.Choice("c", List.of("a", "c")), first);
    assertEquals(1, draws.get());
    // El último no usado agota el pool: los usados vuelven a vacío.
    assertEquals(new PromptDeck.Choice("b", List.of()), PromptDeck.choose(pool, List.of("a", "c"),
        Function.identity(), () -> 0));
    // Con todos usados, se elige entre todos y el ciclo nuevo empieza con el elegido.
    assertEquals(new PromptDeck.Choice("b", List.of("b")), PromptDeck.choose(pool, List.of("a", "b", "c", "x"),
        Function.identity(), () -> 0.5));
  }
}
