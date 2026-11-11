package es.pokemonuniverse.application.avatar;

import es.pokemonuniverse.application.auth.AuthService;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import jakarta.inject.Singleton;
import java.util.function.Function;

/**
 * Subida de un avatar personalizado: procesa y guarda la imagen y después se la da a la cuenta o al invitado nuevo. Si
 * ese segundo paso falla, borra el fichero recién guardado para no dejarlo huérfano. En el invitado, ese paso incluye
 * la respuesta que construye el llamador (la firma de la sesión): si falla, el fichero tampoco queda. En la cuenta
 * registrada no, porque tras {@code apply} la BD ya apunta al fichero nuevo. Es una clase aparte porque
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

  /**
   * Crea un invitado con la imagen subida como avatar y devuelve lo que {@code respond} construya con él (la respuesta
   * con la sesión firmada); si {@code respond} falla, borra el fichero nuevo.
   */
  public <R> R uploadForGuest(String displayName, byte[] contents, String contentType, Function<AuthUser, R> respond) {
    return withStored(contents, contentType, stored -> respond.apply(auth.guest(displayName, stored)));
  }

  private <R> R withStored(byte[] contents, String contentType, Function<AvatarRef.Custom, R> use) {
    var stored = avatars.processAndStore(contents, contentType);
    try {
      return use.apply(stored);
    } catch (RuntimeException e) {
      avatars.remove(stored.value());
      throw e;
    }
  }
}
