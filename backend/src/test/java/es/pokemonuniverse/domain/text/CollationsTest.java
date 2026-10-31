package es.pokemonuniverse.domain.text;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;

class CollationsTest {

  @Test
  void ordersAccentsAndCaseLikeLocaleCompare() {
    var names = Collations.names();
    assertTrue(names.compare("Ñ", "O") < 0);
    assertTrue(names.compare("é", "f") < 0);
    assertTrue(names.compare("a", "B") < 0);
    assertNotEquals(0, names.compare("Zubat", "zubat"));
    assertEquals(0, names.compare("Zubat", "Zubat"));
  }

  @Test
  void spacesAndHyphensAreNotIgnorableLikeIcuInNode() {
    // "Thunder Shock".localeCompare("Thunderbolt") === -1 en Node; java.text.Collator devuelve lo contrario.
    var names = Collations.names();
    assertTrue(names.compare("Thunder Shock", "Thunderbolt") < 0);
    assertTrue(names.compare("Double Kick", "Double-Edge") < 0);
    assertTrue(names.compare("Double-Edge", "DoubleSlap") < 0);
  }

  @Test
  void sortsTheSameFromSeveralThreads() throws Exception {
    var input = List.of("Placaje", "Ácido", "gruñido", "Látigo", "Ñ", "Onda", "ascuas", "Burbuja");
    var expected = input.stream().sorted(Collations.names()).toList();
    try (var pool = Executors.newFixedThreadPool(8)) {
      var futures = new ArrayList<Future<List<String>>>();
      for (int i = 0; i < 64; i++) {
        futures.add(pool.submit(() -> {
          List<String> last = null;
          for (int j = 0; j < 200; j++) last = input.stream().sorted(Collations.names()).toList();
          return last;
        }));
      }
      for (var future : futures) assertEquals(expected, future.get());
    }
  }
}
