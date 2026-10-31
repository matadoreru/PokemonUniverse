package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerEngine;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceEngine;
import java.util.Map;
import java.util.Optional;

/** Motores Java portados, por id. Cada motor se registra aquí al portarlo; un id sin entrada hace fallar su fixture. */
public final class GoldenEngines {

  private static final Map<String, GameEngine<?, ?, ?, ?>> ENGINES = Map.of(
      HigherLowerEngine.ID, new HigherLowerEngine(GoldenManifests.of(HigherLowerEngine.ID)),
      PokedexDistanceEngine.ID, new PokedexDistanceEngine(GoldenManifests.of(PokedexDistanceEngine.ID)));

  private GoldenEngines() {}

  public static Optional<GameEngine<?, ?, ?, ?>> get(String engineId) {
    return Optional.ofNullable(ENGINES.get(engineId));
  }
}
