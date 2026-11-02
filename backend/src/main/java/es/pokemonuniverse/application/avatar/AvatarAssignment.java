package es.pokemonuniverse.application.avatar;

import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.auth.UserIdentityMapper;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code applyAvatar} de {@code apps/server/src/auth/routes.ts} y el gancho {@code onAvatarUpdated} de
 * {@code profile-events.ts}: cambia el avatar de un usuario registrado, avisa a los oyentes (las salas) y borra el
 * fichero personalizado anterior.
 */
@Singleton
public class AvatarAssignment {

  private static final Logger LOG = LoggerFactory.getLogger(AvatarAssignment.class);

  private final UserRepository users;
  private final AvatarService avatars;
  private final List<BiConsumer<String, AvatarRef>> listeners = new CopyOnWriteArrayList<>();

  public AvatarAssignment(UserRepository users, AvatarService avatars) {
    this.users = users;
    this.avatars = avatars;
  }

  /** Oyente síncrono de cada cambio, con el avatar ya leído de la BD (la versión es {@code avatarVersion}). */
  public void onAvatarUpdated(BiConsumer<String, AvatarRef> listener) {
    listeners.add(listener);
  }

  /**
   * Lee el avatar previo, guarda el nuevo con {@code avatarVersion + 1}, construye la identidad desde la fila, avisa y
   * borra el fichero anterior si era personalizado y distinto. Como en Node, la lectura previa y la escritura no van
   * en una transacción.
   *
   * @throws IllegalStateException si el usuario ya no existe (Node responde 500 con {@code findUniqueOrThrow})
   */
  public AuthUser apply(String userId, AvatarRef avatar) {
    var previous = find(userId);
    String previousType = previous.getAvatarType();
    String previousValue = previous.getAvatarValue();
    var type = switch (avatar) {
      case AvatarRef.Default d -> "DEFAULT";
      case AvatarRef.Preset p -> "PRESET";
      case AvatarRef.Custom c -> "CUSTOM";
    };
    String value = switch (avatar) {
      case AvatarRef.Default d -> null;
      case AvatarRef.Preset p -> p.value();
      case AvatarRef.Custom c -> c.value();
    };
    if (users.updateAvatar(userId, type, value, Instant.now()) == 0) throw missing();
    var identity = UserIdentityMapper.identityFromUser(find(userId));
    for (var listener : listeners) {
      try {
        listener.accept(userId, identity.avatar());
      } catch (RuntimeException e) {
        LOG.warn("Avatar listener failed for {}", userId, e);
      }
    }
    if ("CUSTOM".equals(previousType) && previousValue != null && !previousValue.equals(avatar instanceof AvatarRef.Custom c ? c.value() : null)
        && AvatarRef.isValidCustomFile(previousValue)) {
      avatars.remove(previousValue);
    }
    return identity;
  }

  private UserEntity find(String userId) {
    return users.findById(userId).orElseThrow(AvatarAssignment::missing);
  }

  private static IllegalStateException missing() {
    return new IllegalStateException("No User found");
  }
}
