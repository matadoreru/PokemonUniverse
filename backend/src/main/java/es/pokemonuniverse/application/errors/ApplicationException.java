package es.pokemonuniverse.application.errors;

/**
 * Error de negocio de la capa de aplicación. No conoce HTTP: el adaptador REST traduce cada subtipo a su estado
 * ({@code ApplicationExceptionHandler}). El mensaje es el que verá el cliente.
 */
public abstract sealed class ApplicationException extends RuntimeException
    permits BadRequestException, ConflictException, NotFoundException, UnauthorizedException {

  protected ApplicationException(String message) {
    super(message);
  }
}
