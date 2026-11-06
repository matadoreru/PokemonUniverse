package es.pokemonuniverse.adapters.in.rest.daily;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.daily.DailyOverview;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * {@code GET /api/daily}: el reto de hoy (un solo juego), cuántas cuentas lo han terminado y el estado propio. Nunca
 * lleva contenido de la partida; {@code result} viaja como {@code null} mientras no esté {@code FINISHED}.
 */
@Serdeable
public record DailyOverviewResponse(
    String date,
    String resetsAt,
    String gameId,
    String name,
    String icon,
    int roundCount,
    long players,
    String status,
    @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable Result result) {

  /** Resultado propio de hoy; {@code total} son las cuentas que lo han terminado. */
  @Serdeable
  public record Result(int score, int correct, int roundCount, List<Integer> rounds, int position, long total) {}

  static DailyOverviewResponse of(DailyOverview overview) {
    var mine = overview.result();
    return new DailyOverviewResponse(overview.date(), overview.resetsAt(), overview.gameId(), overview.name(),
        overview.icon(), overview.roundCount(), overview.players(), overview.status(),
        mine == null ? null : new Result(mine.score(), mine.correct(), mine.roundCount(), mine.rounds(),
            mine.position(), mine.total()));
  }
}
