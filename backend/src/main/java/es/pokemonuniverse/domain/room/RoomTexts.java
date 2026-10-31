package es.pokemonuniverse.domain.room;

import java.util.List;

/** Textos compartidos de {@code room.ts}. */
public final class RoomTexts {

  private RoomTexts() {}

  /** {@code formatPendingReadyNames}: hasta 3 nombres y «y N más». */
  public static String formatPendingReadyNames(List<String> displayNames) {
    var visible = String.join(", ", displayNames.subList(0, Math.min(3, displayNames.size())));
    int remaining = displayNames.size() - 3;
    return remaining > 0 ? visible + " y " + remaining + " más" : visible;
  }
}
