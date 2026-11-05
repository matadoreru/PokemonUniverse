package es.pokemonuniverse.adapters.in.rest.auth;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/** {@code identifier} es el email o el nombre de usuario, igual que en el inicio de sesión. */
@Serdeable
public record ForgotPasswordRequest(
    @NotBlank(message = "Escribe tu email o tu nombre de usuario")
        @Size(max = 254, message = "El email o el usuario no puede superar los 254 caracteres")
        @Nullable String identifier) {

  /** Recorta y, si es un email, lo pasa a minúsculas como el registro. */
  public ForgotPasswordRequest normalized() {
    if (identifier == null) return this;
    var trimmed = identifier.trim();
    return new ForgotPasswordRequest(trimmed.contains("@") ? trimmed.toLowerCase(Locale.ROOT) : trimmed);
  }
}
