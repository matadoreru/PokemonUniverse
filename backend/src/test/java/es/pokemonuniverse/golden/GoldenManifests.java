package es.pokemonuniverse.golden;

import es.pokemonuniverse.adapters.out.resources.ClasspathGameRegistryLoader;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.serde.ObjectMapper;

/** Manifiestos de {@code games/registry.json} del classpath para construir motores sin arrancar el contenedor. */
public final class GoldenManifests {

  private static final GameRegistry REGISTRY = ClasspathGameRegistryLoader.loadFromClasspath(ObjectMapper.getDefault());

  private GoldenManifests() {}

  /** El registro de producción, con los motores portados de {@code ClasspathGameRegistryLoader}. */
  public static GameRegistry registry() {
    return REGISTRY;
  }

  public static GameManifest of(String gameId) {
    return REGISTRY.get(gameId).orElseThrow(() -> new IllegalStateException("Sin manifiesto en el registro: " + gameId));
  }
}
