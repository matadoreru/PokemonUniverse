package es.pokemonuniverse.application.daily;

import java.util.List;

/** Lectura de los retos terminados de una cuenta, para los logros. */
public interface DailyResultsReader {

  /** Como mucho {@code limit} retos terminados, el más reciente primero. */
  List<DailyResultView> finishedBy(String userId, int limit);
}
