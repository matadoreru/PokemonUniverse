package es.pokemonuniverse.application.daily;

import java.util.List;

/** Un reto terminado de una cuenta, para los logros: fecha {@code AAAA-MM-DD} y {@code finishedAt} en ISO-8601. */
public record DailyResultView(String date, String gameId, int score, int correct, List<Integer> rounds,
    String finishedAt) {

  public DailyResultView {
    rounds = List.copyOf(rounds);
  }
}
