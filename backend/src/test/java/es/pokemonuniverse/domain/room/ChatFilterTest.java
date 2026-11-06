package es.pokemonuniverse.domain.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class ChatFilterTest {

  private final ChatFilter filter =
      new ChatFilter(List.of("capullo", "puta", "cabron", "jodido", "coño", "mierda", "joder"));

  @Test
  void replacesWholeWordsWithThreeAsterisks() {
    assertEquals("eres un ***", filter.apply("eres un capullo"));
  }

  @Test
  void ignoresCaseAndAccents() {
    assertEquals("***", filter.apply("PUTA"));
    assertEquals("***", filter.apply("Cabrón"));
    assertEquals("***", filter.apply("JODÍDO"));
  }

  @Test
  void matchesPluralsWithSOrEs() {
    assertEquals("***", filter.apply("putas"));
    assertEquals("***", filter.apply("cabrones"));
  }

  @Test
  void keepsInnocentWords() {
    for (String ok : List.of("año", "computadora", "disputa", "Putalandia", "cono")) {
      assertEquals(ok, filter.apply(ok));
    }
    assertEquals("***", filter.apply("COÑO"));
  }

  @Test
  void keepsPositionsWithSeveralMatches() {
    assertEquals("***,*** y ***!", filter.apply("mierda,mierda y joder!"));
  }

  @Test
  void noneLeavesTextUntouched() {
    assertEquals("puta mierda", ChatFilter.NONE.apply("puta mierda"));
  }

  @Test
  void fromListSkipsCommentsAndBlankLines() {
    ChatFilter parsed = ChatFilter.fromList("# cabecera\n\n  puta  \n# otra\ncoño\r\n");
    assertEquals("*** y ***", parsed.apply("puta y coño"));
  }

  @Test
  void fromListRejectsTwoWordsOrAccentsWithLineNumber() {
    var two = assertThrows(IllegalArgumentException.class, () -> ChatFilter.fromList("# c\nputa\ndos palabras\n"));
    assertTrue(two.getMessage().contains("3"), two.getMessage());
    var accent = assertThrows(IllegalArgumentException.class, () -> ChatFilter.fromList("cabrón\n"));
    assertTrue(accent.getMessage().contains("1"), accent.getMessage());
  }
}
