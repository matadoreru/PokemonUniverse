package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.GameEngine;
import java.util.Optional;

/**
 * Motores Java portados, por id. Delega en el registro de producción ({@code ClasspathGameRegistryLoader}): un motor
 * registrado ahí entra solo en {@link GoldenReplayTest}; un id sin motor hace fallar su fixture.
 */
public final class GoldenEngines {

  private GoldenEngines() {}

  public static Optional<GameEngine<?, ?, ?, ?>> get(String engineId) {
    return GoldenManifests.registry().engine(engineId);
  }
}
