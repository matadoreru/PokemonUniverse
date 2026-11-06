package es.pokemonuniverse.domain.daily;

import java.util.List;

/**
 * Resultado de una partida del reto: {@code score} son los {@code points} del motor, {@code correct} los aciertos que
 * se muestran y {@code rounds} el valor de cada ronda en orden (el que usa el texto para compartir).
 */
public record DailyOutcome(int score, int correct, List<Integer> rounds) {

  public DailyOutcome {
    rounds = List.copyOf(rounds);
  }
}
