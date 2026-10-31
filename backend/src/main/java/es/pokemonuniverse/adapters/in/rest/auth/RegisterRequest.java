package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.application.auth.RegisterCommand;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

@Serdeable
public record RegisterRequest(
    @NotBlank(message = "El nombre de usuario es obligatorio")
        @Size(min = 3, max = 24, message = "El nombre de usuario debe tener entre 3 y 24 caracteres")
        @Pattern(regexp = "^[a-zA-Z0-9_]+$", message = "El nombre de usuario solo admite letras, números y guion bajo")
        @Nullable String username,
    @NotBlank(message = "El email es obligatorio")
        @Size(max = 254, message = "El email no puede superar los 254 caracteres")
        @Email(message = "El email no es válido")
        @Nullable String email,
    @NotBlank(message = "La contraseña es obligatoria")
        @Size(min = 10, max = 128, message = "La contraseña debe tener entre 10 y 128 caracteres")
        @Nullable String password) {

  /** Aplica el mismo preprocesado que Zod ({@code trim}, {@code toLowerCase}) antes de validar. */
  public RegisterRequest normalized() {
    return new RegisterRequest(
        username == null ? null : username.trim(),
        email == null ? null : email.trim().toLowerCase(Locale.ROOT),
        password);
  }

  public RegisterCommand toCommand() {
    return new RegisterCommand(username, email, password);
  }
}
