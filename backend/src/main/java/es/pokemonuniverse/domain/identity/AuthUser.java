package es.pokemonuniverse.domain.identity;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/** Identidad autenticada (usuario registrado o invitado); es la misma que viaja en la cookie de sesión. */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthUser(
    String id,
    String displayName,
    Kind kind,
    @Nullable String email,
    @Nullable UserRole role,
    AvatarRef avatar) {

  public enum Kind {
    USER,
    GUEST
  }
}
