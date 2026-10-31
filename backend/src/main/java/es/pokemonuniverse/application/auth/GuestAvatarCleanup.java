package es.pokemonuniverse.application.auth;

import es.pokemonuniverse.application.ports.AvatarStorage;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import jakarta.inject.Singleton;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Borra el avatar personalizado de un invitado que se va; equivale a {@code removePriorGuestAvatar} de Node. */
@Singleton
public class GuestAvatarCleanup {

  private static final Logger LOG = LoggerFactory.getLogger(GuestAvatarCleanup.class);

  private final AvatarStorage storage;

  public GuestAvatarCleanup(AvatarStorage storage) {
    this.storage = storage;
  }

  /** @param except fichero que debe conservarse (puede ser {@code null}). */
  public void removePriorGuestAvatar(Optional<AuthUser> identity, String except) {
    identity
        .filter(user -> user.kind() == AuthUser.Kind.GUEST)
        .map(AuthUser::avatar)
        .filter(AvatarRef.Custom.class::isInstance)
        .map(avatar -> ((AvatarRef.Custom) avatar).value())
        .filter(file -> !file.equals(except))
        .ifPresent(file -> {
          try {
            storage.remove(file);
          } catch (RuntimeException e) {
            LOG.warn("Could not remove guest avatar {}", file, e);
          }
        });
  }
}
