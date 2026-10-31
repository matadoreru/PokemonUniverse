package es.pokemonuniverse.adapters.in.rest;

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
