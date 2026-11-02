package es.pokemonuniverse.domain.game.engine;

import java.util.List;

/**
 * Un issue de validación de configuración con su ruta Zod: claves de objeto ({@link String}) e índices de array
 * ({@link Integer}); la ruta vacía es la raíz. {@code message} es el mismo texto que la {@link ConfigValidationException}.
 */
public record ConfigIssue(List<Object> path, String message) {

  public ConfigIssue {
    path = List.copyOf(path);
  }
}
