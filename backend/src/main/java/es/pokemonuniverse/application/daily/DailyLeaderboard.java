package es.pokemonuniverse.application.daily;

import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;
import java.util.List;

/** Clasificación del día: las primeras filas terminadas y la fila propia ({@code me}), aunque no esté entre ellas. */
public record DailyLeaderboard(String date, String gameId, long total, List<Entry> entries, @Nullable Me me) {

  public DailyLeaderboard {
    entries = List.copyOf(entries);
  }

  /** Las puntuaciones iguales comparten {@code position} (1, 1, 3). */
  public record Entry(int position, String userId, String username, AvatarRef avatar, int score, int correct,
      String finishedAt) {}

  /** La fila propia; {@code position}, {@code score}, {@code correct} y {@code rounds} solo en {@code FINISHED}. */
  public record Me(String status, @Nullable Integer position, @Nullable Integer score, @Nullable Integer correct,
      @Nullable List<Integer> rounds) {}
}
