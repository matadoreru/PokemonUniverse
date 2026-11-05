package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.application.auth.LoginCommand;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/** {@code identifier} es el email o el nombre de usuario: con {@code @} es un email (los usuarios no lo admiten). */
@Serdeable
public record LoginRequest(
    @NotBlank(message = "Escribe tu email o tu nombre de usuario")
        @Size(max = 254, message = "El email o el usuario no puede superar los 254 caracteres")
        @Nullable String identifier,
    @NotNull(message = "La contraseña es obligatoria")
        @Size(min = 1, max = 128, message = "La contraseña debe tener entre 1 y 128 caracteres")
        @Nullable String password) {

  /** Recorta y, si es un email, lo pasa a minúsculas como el registro. */
  public LoginRequest normalized() {
    if (identifier == null) return this;
    var trimmed = identifier.trim();
    return new LoginRequest(trimmed.contains("@") ? trimmed.toLowerCase(Locale.ROOT) : trimmed, password);
  }

  public LoginCommand toCommand() {
    return new LoginCommand(identifier, password);
  }
}
