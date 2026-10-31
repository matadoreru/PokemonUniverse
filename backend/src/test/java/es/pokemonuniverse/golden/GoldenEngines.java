package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.GameEngine;
import java.util.Map;
import java.util.Optional;

/** Motores Java portados, por id. Cada motor se registra aquí al portarlo; un id sin entrada hace fallar su fixture. */
public final class GoldenEngines {

  private static final Map<String, GameEngine<?, ?, ?, ?>> ENGINES = Map.of();

  private GoldenEngines() {}

  public static Optional<GameEngine<?, ?, ?, ?>> get(String engineId) {
    return Optional.ofNullable(ENGINES.get(engineId));
  }
}
