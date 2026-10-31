package es.pokemonuniverse;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;

@OpenAPIDefinition(info = @Info(title = "Pokémon Universe API", version = "0.1"))
public final class Application {

  private Application() {}

  public static void main(String[] args) {
    Micronaut.run(Application.class, args);
  }
}
