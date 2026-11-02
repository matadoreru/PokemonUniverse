package es.pokemonuniverse.application.errors;

import es.pokemonuniverse.application.validation.ZodIssues;
import java.util.List;
import java.util.Map;

/**
 * Entrada rechazada por un esquema Zod portado. El adaptador REST la responde como el manejador global de Node: 400
 * {@code {error: <primer mensaje>, issues}} con las incidencias completas.
 */
public final class InvalidInputException extends RuntimeException {

  private final transient List<Map<String, Object>> issues;

  public InvalidInputException(ZodIssues issues) {
    super(issues.firstMessage());
    this.issues = issues.list();
  }

  public List<Map<String, Object>> issues() {
    return issues;
  }
}
