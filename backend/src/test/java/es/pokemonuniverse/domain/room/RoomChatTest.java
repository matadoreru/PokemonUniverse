package es.pokemonuniverse.domain.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class RoomChatTest {

  private static final ChatFilter NONE = ChatFilter.NONE;

  private static String post(RoomChat c, String author, String text, boolean host, long now) {
    return c.post(author, author, text, host, now, NONE).text();
  }

  private static String rejection(Runnable r) {
    return assertThrows(RoomChat.Rejected.class, r::run).getMessage();
  }

  @Test
  void normalizesControlCharsAndSpaces() {
    assertEquals("hola que tal", RoomChat.normalize("  hola\n\tque  tal "));
  }

  @Test
  void rejectsEmptyAndNull() {
    RoomChat c = new RoomChat();
    assertEquals("Message is empty", rejection(() -> post(c, "a", null, false, 0)));
    assertEquals("Message is empty", rejection(() -> post(c, "a", " \n\t ", false, 0)));
  }

  @Test
  void acceptsExactly200AndRejects201() {
    RoomChat c = new RoomChat();
    assertEquals(200, post(c, "a", " " + "x".repeat(200) + " ", false, 0).length());
    assertEquals("Message is too long", rejection(() -> post(c, "a", "x".repeat(201), false, 0)));
  }

  @Test
  void appliesFilterAfterLengthCheck() {
    RoomChat c = new RoomChat();
    ChatFilter filter = new ChatFilter(List.of("feo"));
    assertEquals("eres ***", c.post("a", "A", "eres feo", false, 0, filter).text());
    String longWords = "feo ".repeat(50).trim(); // 199 unidades antes de filtrar
    assertEquals(199, longWords.length());
    assertEquals(199, c.post("a", "A", longWords, false, 1, filter).text().length());
  }

  @Test
  void keepsLast50AndSeqKeepsGrowing() {
    RoomChat c = new RoomChat();
    for (int i = 0; i < 55; i++) {
      c.post("p" + i, "P", "m", false, 0, NONE);
    }
    List<ChatMessage> h = c.history();
    assertEquals(50, h.size());
    assertEquals(6, h.get(0).seq());
    assertEquals(55, h.get(49).seq());
  }

  @Test
  void rateWindowSlides() {
    RoomChat c = new RoomChat();
    long t = 1_000_000L;
    for (int i = 0; i < 45; i++) {
      post(c, "a", "m", false, t);
    }
    assertEquals("Too many chat messages", rejection(() -> post(c, "a", "m", false, t + 59_999)));
    assertEquals("m", post(c, "a", "m", false, t + 60_000));
    // el rechazo no ocupó hueco: tras el envío de t+60_000 hay 1 en ventana, caben 44 más
    for (int i = 0; i < 44; i++) {
      post(c, "a", "m", false, t + 60_000);
    }
    assertEquals("Too many chat messages", rejection(() -> post(c, "a", "m", false, t + 60_001)));
    // otro jugador no se ve afectado
    assertEquals("m", post(c, "b", "m", false, t + 60_001));
  }

  @Test
  void mutedAuthorIsRejectedUnlessHost() {
    RoomChat c = new RoomChat();
    c.setMuted("a", true);
    assertEquals("You are muted in this chat", rejection(() -> post(c, "a", "hola", false, 0)));
    assertEquals("hola", post(c, "a", "hola", true, 0));
  }

  @Test
  void checkOrderEmptyBeforeMuted() {
    RoomChat c = new RoomChat();
    c.setMuted("a", true);
    assertEquals("Message is empty", rejection(() -> post(c, "a", "  ", false, 0)));
  }

  @Test
  void deleteRemovesAndUnknownSeqFails() {
    RoomChat c = new RoomChat();
    ChatMessage m = c.post("a", "A", "hola", false, 5, NONE);
    assertEquals(m, c.find(m.seq()));
    c.delete(m.seq());
    assertTrue(c.history().isEmpty());
    assertEquals(null, c.find(m.seq()));
    assertEquals("Message not found", rejection(() -> c.delete(m.seq())));
  }

  @Test
  void setMutedTogglesAndIsIdempotent() {
    RoomChat c = new RoomChat();
    assertFalse(c.isMuted("a"));
    c.setMuted("a", true);
    c.setMuted("a", true);
    assertTrue(c.isMuted("a"));
    c.setMuted("a", false);
    c.setMuted("a", false);
    assertFalse(c.isMuted("a"));
  }
}
