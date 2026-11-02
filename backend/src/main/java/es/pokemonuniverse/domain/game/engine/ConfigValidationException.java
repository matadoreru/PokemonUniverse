package es.pokemonuniverse.domain.game.engine;

import java.util.List;

/**
 * Configuración o acción que no supera el esquema del motor (el {@code safeParse} fallido de Zod). {@link #path()} es
 * la ruta Zod del primer issue (vacía en la raíz o cuando quien lanza no la conoce).
 */
public class ConfigValidationException extends EngineException {

  private final List<Object> path;

  public ConfigValidationException(String message) {
    this(message, List.of());
  }

  public ConfigValidationException(String message, List<Object> path) {
    super(message);
    this.path = List.copyOf(path);
  }

  public List<Object> path() {
    return path;
  }
}
