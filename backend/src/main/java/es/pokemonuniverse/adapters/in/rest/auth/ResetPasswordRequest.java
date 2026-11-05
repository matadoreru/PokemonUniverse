package es.pokemonuniverse.adapters.in.rest.auth;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Serdeable
public record ResetPasswordRequest(
    @NotBlank(message = "El enlace no es válido")
        @Size(max = 128, message = "El enlace no es válido")
        @Nullable String token,
    @NotNull(message = "La contraseña es obligatoria")
        @Size(min = 10, max = 128, message = "La contraseña debe tener entre 10 y 128 caracteres")
        @Nullable String password) {

  public ResetPasswordRequest normalized() {
    return new ResetPasswordRequest(token == null ? null : token.trim(), password);
  }
}
