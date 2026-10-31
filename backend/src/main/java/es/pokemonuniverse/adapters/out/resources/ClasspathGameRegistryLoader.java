package es.pokemonuniverse.adapters.out.resources;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.context.annotation.Factory;
import io.micronaut.core.type.Argument;
import io.micronaut.serde.ObjectMapper;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.InputStream;

/** Crea el bean {@link GameRegistry} a partir de {@code games/registry.json} ({@code npm run registry:export}). */
@Factory
public class ClasspathGameRegistryLoader {

  static final String RESOURCE = "games/registry.json";

  @Singleton
  GameRegistry gameRegistry(ObjectMapper mapper) {
    return loadFromClasspath(mapper);
  }

  /** Lee {@code games/registry.json} del classpath; también lo usan los tests que construyen motores sin contenedor. */
  public static GameRegistry loadFromClasspath(ObjectMapper mapper) {
    try (InputStream in = ClasspathGameRegistryLoader.class.getClassLoader().getResourceAsStream(RESOURCE)) {
      if (in == null) {
        throw new IllegalStateException("Falta el recurso " + RESOURCE + ". Ejecuta npm run registry:export");
      }
      return load(mapper, in);
    } catch (IOException e) {
      throw new IllegalStateException("No se pudo leer " + RESOURCE, e);
    }
  }

  static GameRegistry load(ObjectMapper mapper, InputStream in) throws IOException {
    return new GameRegistry(mapper.readValue(in, Argument.listOf(GameManifest.class)));
  }
}
