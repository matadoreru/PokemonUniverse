package es.pokemonuniverse.domain.game.engine;

/** Configuración o acción que no supera el esquema del motor (el {@code safeParse} fallido de Zod). */
public class ConfigValidationException extends EngineException {

  public ConfigValidationException(String message) {
    super(message);
  }
}
