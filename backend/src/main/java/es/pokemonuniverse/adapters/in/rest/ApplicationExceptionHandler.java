package es.pokemonuniverse.adapters.in.rest;

import es.pokemonuniverse.application.errors.ApplicationException;
import es.pokemonuniverse.application.errors.BadRequestException;
import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.InvalidResetLinkException;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import es.pokemonuniverse.application.friends.FriendNotFoundException;
import es.pokemonuniverse.application.friends.FriendRequestException;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

/** Traduce los errores de la capa de aplicación al estado HTTP y al cuerpo {@code {"error": "..."}}. */
@Produces
@Singleton
public class ApplicationExceptionHandler implements ExceptionHandler<ApplicationException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, ApplicationException exception) {
    HttpStatus status = switch (exception) {
      // Subclases fuera de este paquete: van antes que su clase base.
      case FriendRequestException e -> HttpStatus.BAD_REQUEST;
      case FriendNotFoundException e -> HttpStatus.NOT_FOUND;
      case BadRequestException e -> HttpStatus.BAD_REQUEST;
      case ConflictException e -> HttpStatus.CONFLICT;
      case InvalidResetLinkException e -> HttpStatus.BAD_REQUEST;
      case NotFoundException e -> HttpStatus.NOT_FOUND;
      case UnauthorizedException e -> HttpStatus.UNAUTHORIZED;
    };
    return HttpResponse.status(status).body(ApiError.of(exception.getMessage()));
  }
}
