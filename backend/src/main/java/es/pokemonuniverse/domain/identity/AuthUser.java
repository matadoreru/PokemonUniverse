package es.pokemonuniverse.domain.identity;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Identidad autenticada (usuario registrado o invitado); es la misma que viaja en la cookie de sesión. Sin
 * {@code email} ni {@code role} (invitados) las claves no salen: en el OpenAPI son opcionales, nunca {@code null}.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthUser(
    String id,
    String displayName,
    Kind kind,
    @Nullable @Schema(nullable = false) String email,
    @Nullable @Schema(nullable = false) UserRole role,
    AvatarRef avatar) {

  public enum Kind {
    USER,
    GUEST
  }
}
