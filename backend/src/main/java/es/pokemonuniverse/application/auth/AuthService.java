package es.pokemonuniverse.application.auth;

import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.adapters.out.persistence.UserStatsEntity;
import es.pokemonuniverse.adapters.out.persistence.UserStatsRepository;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.data.exceptions.DataAccessException;
import io.micronaut.http.HttpStatus;
import jakarta.inject.Singleton;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.UUID;

@Singleton
public class AuthService {

  private static final String CONFLICT = "Email or username already in use";

  private final UserRepository users;
  private final UserStatsRepository stats;
  private final PasswordHasher hasher;

  public AuthService(UserRepository users, UserStatsRepository stats, PasswordHasher hasher) {
    this.users = users;
    this.stats = stats;
    this.hasher = hasher;
  }

  @Transactional
  public AuthUser register(RegisterCommand cmd) {
    if (users.existsByEmailOrUsername(cmd.email(), cmd.username())) {
      throw new ApiException(HttpStatus.CONFLICT, CONFLICT);
    }
    var user = UserEntity.create(UUID.randomUUID().toString(), cmd.username(), cmd.email(), hasher.hash(cmd.password()), Instant.now());
    try {
      users.save(user);
      stats.save(new UserStatsEntity(user.getId()));
    } catch (DataAccessException | PersistenceException e) {
      // Carrera entre dos registros: la restricción única de la base de datos gana.
      throw new ApiException(HttpStatus.CONFLICT, CONFLICT);
    }
    return UserIdentityMapper.identityFromUser(user);
  }

  public AuthUser login(LoginCommand cmd) {
    return users.findByEmail(cmd.email())
        .filter(user -> hasher.matches(cmd.password(), user.getPasswordHash()))
        .map(UserIdentityMapper::identityFromUser)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password"));
  }

  public AuthUser guest(GuestCommand cmd) {
    AvatarRef avatar = cmd.avatarPresetId() == null ? new AvatarRef.Default() : new AvatarRef.Preset(cmd.avatarPresetId());
    return new AuthUser("guest_" + UUID.randomUUID(), cmd.displayName(), AuthUser.Kind.GUEST, null, null, avatar);
  }
}
