package es.pokemonuniverse.application.daily;

/**
 * Aviso de un reto terminado, después de guardar {@code FINISHED}; nunca con el lock de una sala tomado. Por defecto
 * no hace nada ({@code DailyBeans}); los logros lo implementarán.
 */
public interface DailyResultEvents {

  DailyResultEvents NONE = (userId, result) -> {};

  void finished(String userId, DailyResultView result);
}
