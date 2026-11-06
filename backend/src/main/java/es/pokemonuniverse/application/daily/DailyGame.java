package es.pokemonuniverse.application.daily;

import io.micronaut.json.tree.JsonNode;
import java.util.List;
import java.util.SortedMap;

/** Un minijuego del sorteo del reto diario: su configuración fija y cómo se lee el resultado de cada ronda. */
public interface DailyGame {

  String gameId();

  /** Rondas del reto con la configuración fija. */
  int roundCount();

  /** {@code defaultConfig} (el {@code engine.defaultConfig()} del motor) con las claves del reto sustituidas. */
  JsonNode config(JsonNode defaultConfig);

  /**
   * Apunta en {@code outcomes} (ronda base 1 → valor) las rondas cerradas que muestre {@code publicState}; un estado
   * de otro juego o de una fase sin resultado no apunta nada. Solo trabaja en memoria.
   */
  void observe(Object publicState, String playerId, SortedMap<Integer, Integer> outcomes);

  /** Valor de una ronda que no se observó: {@code -1}, o {@code 0} en Learnset Guess. */
  int missingValue();

  /** Aciertos que se muestran, a partir de los valores de todas las rondas. */
  int correct(List<Integer> rounds);
}
