package es.pokemonuniverse.adapters.in.rest;

import es.pokemonuniverse.application.errors.BadRequestException;
import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Post;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Requires(env = "test")
@Controller("/test-errors")
class TestErrorsController {

  @Serdeable
  record Input(@NotBlank @Size(min = 3) String username) {}

  @Get("/conflict")
  String conflict() {
    throw new ApiException(HttpStatus.CONFLICT, "Email or username already in use");
  }

  /** Errores de la capa de aplicación: el adaptador REST les pone el estado HTTP. */
  @Get("/application/{kind}")
  String application(String kind) {
    throw switch (kind) {
      case "conflict" -> new ConflictException("conflicto");
      case "unauthorized" -> new UnauthorizedException("sin sesion");
      case "not-found" -> new NotFoundException("no existe");
      default -> new BadRequestException("mal");
    };
  }

  @Post("/validate")
  String validate(@Valid @Body Input input) {
    return "ok";
  }

  @Get("/checked")
  String checked() throws java.io.IOException {
    throw new java.io.IOException("disk");
  }

  @Get("/boom")
  String boom() {
    throw new IllegalStateException("kaboom");
  }
}
