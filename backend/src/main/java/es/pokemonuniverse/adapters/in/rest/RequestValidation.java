package es.pokemonuniverse.adapters.in.rest;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;

/** Validación manual de un cuerpo ya normalizado; el manejador global da formato al fallo con la ruta del campo. */
public final class RequestValidation {

  private RequestValidation() {}

  /** Devuelve {@code request} si cumple sus restricciones; si no, lanza {@link ConstraintViolationException}. */
  public static <T> T valid(Validator validator, T request) {
    var violations = validator.validate(request);
    if (!violations.isEmpty()) throw new ConstraintViolationException(violations);
    return request;
  }
}
