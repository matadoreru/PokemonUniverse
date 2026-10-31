package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GamePhase;
import io.micronaut.core.annotation.Nullable;

/** Estado con ronda temporizada; los records de estado de los motores lo implementan con componentes homónimos. */
public interface TimedGameState {

  GamePhase phase();

  @Nullable
  Long roundEndsAt();

  @Nullable
  Long nextTransitionAt();
}
