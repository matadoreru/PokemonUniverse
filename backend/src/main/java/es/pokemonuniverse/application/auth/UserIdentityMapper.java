package es.pokemonuniverse.application.auth;

import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;

/** Única traducción de una fila "User" a la identidad pública (equivale a identityFromUser de Node). */
public final class UserIdentityMapper {

  private UserIdentityMapper() {}

  public static AuthUser identityFromUser(UserEntity user) {
    return new AuthUser(
        user.getId(),
        user.getUsername(),
        AuthUser.Kind.USER,
        user.getEmail(),
        user.getRole(),
        avatarFromUser(user.getAvatarType(), user.getAvatarValue(), user.getAvatarVersion()));
  }

  /** Cualquier otro tipo (también un {@code PRESET} antiguo) se lee como {@code DEFAULT}. */
  public static AvatarRef avatarFromUser(String type, String value, int version) {
    if ("CUSTOM".equals(type) && AvatarRef.isValidCustomFile(value)) return new AvatarRef.Custom(value, version);
    return new AvatarRef.Default();
  }
}
