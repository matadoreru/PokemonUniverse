package es.pokemonuniverse.domain.room;

import io.micronaut.core.annotation.Nullable;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.text.Normalizer;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Estado del chat de una sala: últimos mensajes, límite de envío por jugador y silenciados.
 * No es seguro entre hilos: solo se usa con el lock de la sala tomado.
 */
public final class RoomChat {

  public static final int HISTORY_LIMIT = 50;
  public static final int MAX_LENGTH = 200;
  public static final int RATE_LIMIT = 45;
  public static final long RATE_WINDOW_MS = 60_000L;

  public static final String EMPTY = "Message is empty";
  public static final String TOO_LONG = "Message is too long";
  public static final String MUTED = "You are muted in this chat";
  public static final String RATE_LIMITED = "Too many chat messages";
  public static final String NOT_FOUND = "Message not found";
  public static final String CANNOT_MUTE_SELF = "Cannot mute yourself";

  /** Envío rechazado; el mensaje es el texto de error que ve el jugador. */
  public static final class Rejected extends RuntimeException {
    public Rejected(String message) {
      super(message);
    }
  }

  private final ArrayDeque<ChatMessage> history = new ArrayDeque<>();
  private final Map<String, ArrayDeque<Long>> sentTimes = new HashMap<>();
  private final Set<String> muted = new LinkedHashSet<>();
  private long nextSeq = 1;

  /**
   * Valida y guarda un mensaje. Orden de comprobación: vacío, largo, silencio (el anfitrión nunca
   * está silenciado) y límite de envío. Un rechazo no ocupa hueco en la ventana.
   */
  public ChatMessage post(String authorId, String authorName, @Nullable String rawText,
      boolean authorIsHost, long now, ChatFilter filter) {
    String text = rawText == null ? "" : normalize(rawText);
    if (text.isEmpty()) {
      throw new Rejected(EMPTY);
    }
    if (text.length() > MAX_LENGTH) {
      throw new Rejected(TOO_LONG);
    }
    if (!authorIsHost && muted.contains(authorId)) {
      throw new Rejected(MUTED);
    }
    ArrayDeque<Long> times = sentTimes.computeIfAbsent(authorId, k -> new ArrayDeque<>());
    while (!times.isEmpty() && times.peekFirst() <= now - RATE_WINDOW_MS) {
      times.pollFirst();
    }
    if (times.size() >= RATE_LIMIT) {
      throw new Rejected(RATE_LIMITED);
    }
    times.addLast(now);
    ChatMessage message = new ChatMessage(nextSeq++, authorId, authorName, filter.apply(text), now);
    history.addLast(message);
    while (history.size() > HISTORY_LIMIT) {
      history.pollFirst();
    }
    return message;
  }

  /** Borra un mensaje del historial; falla si ya no está. */
  public void delete(long seq) {
    if (!history.removeIf(m -> m.seq() == seq)) {
      throw new Rejected(NOT_FOUND);
    }
  }

  public @Nullable ChatMessage find(long seq) {
    for (ChatMessage m : history) {
      if (m.seq() == seq) {
        return m;
      }
    }
    return null;
  }

  public boolean isMuted(String playerId) {
    return muted.contains(playerId);
  }

  public void setMuted(String playerId, boolean muted) {
    if (muted) {
      this.muted.add(playerId);
    } else {
      this.muted.remove(playerId);
    }
  }

  /** Copia inmutable, del más antiguo al más nuevo. */
  public List<ChatMessage> history() {
    return List.copyOf(history);
  }

  private static final Pattern CONTROL = Pattern.compile("\\p{Cc}");
  private static final Pattern INVISIBLE = Pattern.compile("\\p{Cf}");
  private static final Pattern SPACES = Pattern.compile(" {2,}");

  /**
   * Pasa a NFC (las tildes descompuestas no evaden el filtro), quita los caracteres invisibles de
   * formato (ancho cero, etc.), cada carácter de control pasa a espacio, los espacios seguidos se
   * funden y se recorta.
   */
  static String normalize(String raw) {
    String nfc = Normalizer.normalize(raw, Normalizer.Form.NFC);
    String visible = INVISIBLE.matcher(nfc).replaceAll("");
    String spaced = CONTROL.matcher(visible).replaceAll(" ");
    return SPACES.matcher(spaced).replaceAll(" ").trim();
  }
}
