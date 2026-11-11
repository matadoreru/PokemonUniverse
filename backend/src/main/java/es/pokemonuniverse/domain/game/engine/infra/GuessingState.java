package es.pokemonuniverse.domain.game.engine.infra;

import java.util.List;
import java.util.Map;

/**
 * Estado de una ronda de adivinar con aciertos por jugador y cooldown tras cada fallo; los records de estado de los
 * motores lo implementan con componentes homónimos. Lo usa {@link GuessingRound#precheck}.
 */
public interface GuessingState extends TimedGameState {

  List<String> playerIds();

  /** Los aciertos de la ronda, por jugador. */
  Map<String, ?> solves();

  Map<String, Long> cooldownUntil();
}
