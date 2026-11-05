package es.pokemonuniverse.application.auth;

import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import jakarta.inject.Singleton;
import java.util.Optional;

/** Búsqueda de una cuenta registrada por el identificador que escribe el jugador (login y recuperar contraseña). */
@Singleton
public class AccountLookup {

  private final UserRepository users;

  public AccountLookup(UserRepository users) {
    this.users = users;
  }

  /**
   * Con {@code @} busca por email; si no, por nombre de usuario: primero exacto y, si no hay, sin distinguir
   * mayúsculas siempre que solo coincida una cuenta (el índice único sí las distingue).
   */
  public Optional<UserEntity> find(String identifier) {
    if (identifier.contains("@")) return users.findByEmail(identifier);
    return findByUsername(identifier);
  }

  /**
   * Solo por nombre de usuario (sin email): exacto y, si no hay, sin distinguir mayúsculas siempre que solo coincida
   * una cuenta. La usan el login y las solicitudes de amistad.
   */
  public Optional<UserEntity> findByUsername(String username) {
    var exact = users.findByUsername(username);
    if (exact.isPresent()) return exact;
    var matches = users.findAllByUsernameIgnoringCase(username);
    return matches.size() == 1 ? Optional.of(matches.getFirst()) : Optional.empty();
  }
}
