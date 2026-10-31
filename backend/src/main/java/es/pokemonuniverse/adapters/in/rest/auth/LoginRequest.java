package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.application.auth.LoginCommand;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;

@Serdeable
public record LoginRequest(
    @NotBlank(message = "El email es obligatorio")
        @Size(max = 254, message = "El email no puede superar los 254 caracteres")
        @Email(message = "El email no es válido")
        @Nullable String email,
    @NotBlank(message = "La contraseña es obligatoria")
        @Size(max = 128, message = "La contraseña no puede superar los 128 caracteres")
        @Nullable String password) {

  public LoginRequest normalized() {
    return new LoginRequest(email == null ? null : email.trim().toLowerCase(Locale.ROOT), password);
  }

  public LoginCommand toCommand() {
    return new LoginCommand(email, password);
  }
}
