package es.pokemonuniverse.adapters.in.rest.friends;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Cuerpo de {@code POST /api/friends/requests}: el nombre de usuario de la cuenta a la que se pide la amistad. */
@Serdeable
public record SendFriendRequest(
    @NotBlank(message = "Escribe el nombre de usuario")
        @Size(max = 24, message = "El nombre de usuario no puede superar los 24 caracteres")
        @Nullable String username) {

  /** Recorta los espacios antes de validar. */
  public SendFriendRequest normalized() {
    return username == null ? this : new SendFriendRequest(username.trim());
  }
}
