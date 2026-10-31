package es.pokemonuniverse;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;

@OpenAPIDefinition(info = @Info(title = "Pokémon Universe API", version = "0.1"))
public final class Application {

  private Application() {}

  public static void main(String[] args) {
    // Las transformaciones de imagen usan Java2D sin pantalla (también fijado en JAVA_TOOL_OPTIONS del Dockerfile).
    System.setProperty("java.awt.headless", "true");
    Micronaut.run(Application.class, args);
  }
}
