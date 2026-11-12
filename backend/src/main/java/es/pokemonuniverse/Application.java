package es.pokemonuniverse;

import es.pokemonuniverse.tools.Healthcheck;
import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;

@OpenAPIDefinition(info = @Info(title = "Pokémon Universe API", version = "0.1"))
public final class Application {

  private Application() {}

  public static void main(String[] args) {
    // Sonda de salud de la imagen nativa (sin curl ni wget): no arranca el servidor.
    if (args.length == 1 && Healthcheck.FLAG.equals(args[0])) {
      Healthcheck.main(args);
      return;
    }
    // Las transformaciones de imagen usan Java2D sin pantalla (también fijado en JAVA_TOOL_OPTIONS del Dockerfile).
    System.setProperty("java.awt.headless", "true");
    if (NativeImage.RUNNING) NativeImage.configure();
    Micronaut.run(Application.class, args);
  }
}
