package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.core.type.Argument;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;

/**
 * Manifiestos de {@code games/registry.json} del classpath, leídos igual que {@code ClasspathGameRegistryLoader} (cuyo
 * {@code load} es de paquete) para construir los motores sin arrancar el contenedor.
 */
public final class GoldenManifests {

  private static final String RESOURCE = "games/registry.json";
  private static volatile GameRegistry registry;

  private GoldenManifests() {}

  public static GameManifest of(String gameId) {
    return registry().get(gameId).orElseThrow(() -> new IllegalStateException("Sin manifiesto en " + RESOURCE + ": " + gameId));
  }

  private static GameRegistry registry() {
    var loaded = registry;
    if (loaded != null) return loaded;
    try (var in = GoldenManifests.class.getClassLoader().getResourceAsStream(RESOURCE)) {
      if (in == null) throw new IllegalStateException("Falta el recurso " + RESOURCE + ". Ejecuta npm run registry:export");
      loaded = new GameRegistry(ObjectMapper.getDefault().readValue(in, Argument.listOf(GameManifest.class)));
      registry = loaded;
      return loaded;
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo leer " + RESOURCE, e);
    }
  }
}
