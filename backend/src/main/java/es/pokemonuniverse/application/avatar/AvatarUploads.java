package es.pokemonuniverse.application.avatar;

import es.pokemonuniverse.application.auth.AuthService;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import jakarta.inject.Singleton;
import java.util.function.Function;

/**
 * Subida de un avatar personalizado: procesa y guarda la imagen y después se la da a la cuenta o al invitado nuevo. Si
 * ese segundo paso falla, borra el fichero recién guardado para no dejarlo huérfano. Es una clase aparte porque
 * {@link AvatarAssignment} ya depende de {@link AvatarService}.
 */
@Singleton
public class AvatarUploads {

  private final AvatarService avatars;
  private final AvatarAssignment assignment;
  private final AuthService auth;

  public AvatarUploads(AvatarService avatars, AvatarAssignment assignment, AuthService auth) {
    this.avatars = avatars;
    this.assignment = assignment;
    this.auth = auth;
  }

  /** Cambia el avatar de la cuenta registrada por la imagen subida; devuelve la identidad ya actualizada. */
  public AuthUser uploadForUser(String userId, byte[] contents, String contentType) {
    return withStored(contents, contentType, stored -> assignment.apply(userId, stored));
  }

  /** Crea un invitado con la imagen subida como avatar. */
  public AuthUser uploadForGuest(String displayName, byte[] contents, String contentType) {
    return withStored(contents, contentType, stored -> auth.guest(displayName, stored));
  }

  private AuthUser withStored(byte[] contents, String contentType, Function<AvatarRef.Custom, AuthUser> use) {
    var stored = avatars.processAndStore(contents, contentType);
    try {
      return use.apply(stored);
    } catch (RuntimeException e) {
      avatars.remove(stored.value());
      throw e;
    }
  }
}
