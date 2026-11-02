package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * Solo documenta en OpenAPI el 400 de las rutas que validan con esquemas Zod portados
 * ({@link es.pokemonuniverse.application.errors.InvalidInputException}): {@code {error: <primer mensaje>, issues}}
 * con las incidencias de Zod tal cual (las escribe {@link InvalidInputExceptionHandler}). El resto de rutas sigue con
 * {@link ApiError}.
 */
@Serdeable
@Schema(name = "ValidationErrorResponse",
    description = "400 con incidencias de Zod: `error` es el mensaje de la primera incidencia.")
public record ValidationErrorResponse(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String error,
    @ArraySchema(schema = @Schema(implementation = ZodIssue.class), arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED))
    List<ZodIssue> issues) {

  /**
   * Incidencia de Zod 4: {@code code}, {@code path} y {@code message} siempre; el resto de claves depende del código
   * ({@code expected}, {@code origin}, {@code minimum}, {@code maximum}, {@code inclusive}, {@code keys}, ...).
   */
  @Serdeable
  @Schema(name = "ZodIssue", additionalProperties = Schema.AdditionalPropertiesValue.TRUE)
  public record ZodIssue(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String code,
      @ArraySchema(schema = @Schema(oneOf = {String.class, Integer.class}),
          arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED))
      List<Object> path,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String message) {}
}
