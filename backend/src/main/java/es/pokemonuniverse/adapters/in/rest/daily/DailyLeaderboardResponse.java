package es.pokemonuniverse.adapters.in.rest.daily;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.daily.DailyLeaderboard;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * {@code GET /api/daily/leaderboard}: la clasificación de hoy (las primeras filas terminadas) y la fila propia
 * ({@code me}), aunque no esté entre ellas. Sin contenido de la partida.
 */
@Serdeable
public record DailyLeaderboardResponse(String date, String gameId, long total, List<Entry> entries, Me me) {

  /** Las puntuaciones iguales comparten {@code position} (1, 1, 3); {@code finishedAt} en ISO-8601. */
  @Serdeable
  public record Entry(int position, String userId, String username, AvatarRef avatar, int score, int correct,
      String finishedAt) {}

  /** La fila propia; {@code position}, {@code score}, {@code correct} y {@code rounds} son {@code null} salvo en {@code FINISHED}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record Me(
      @Schema(type = "string", allowableValues = {"AVAILABLE", "IN_PROGRESS", "FINISHED", "ABANDONED"},
          requiredMode = Schema.RequiredMode.REQUIRED)
      String status,
      @Nullable Integer position,
      @Nullable Integer score,
      @Nullable Integer correct,
      @Nullable List<Integer> rounds) {}

  static DailyLeaderboardResponse of(DailyLeaderboard board) {
    var me = board.me();
    if (me == null) throw new IllegalStateException("La clasificación del reto siempre lleva la fila propia");
    return new DailyLeaderboardResponse(board.date(), board.gameId(), board.total(),
        board.entries().stream().map(entry -> new Entry(entry.position(), entry.userId(), entry.username(),
            entry.avatar(), entry.score(), entry.correct(), entry.finishedAt())).toList(),
        new Me(me.status(), me.position(), me.score(), me.correct(), me.rounds()));
  }
}
