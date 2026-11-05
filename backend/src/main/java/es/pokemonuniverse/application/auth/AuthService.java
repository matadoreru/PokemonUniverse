package es.pokemonuniverse.application.auth;

import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.adapters.out.persistence.UserStatsEntity;
import es.pokemonuniverse.adapters.out.persistence.UserStatsRepository;
import es.pokemonuniverse.application.errors.ConflictException;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.data.exceptions.DataAccessException;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;
import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;

@Singleton
public class AuthService {

  private static final String CONFLICT = "Email or username already in use";

  private final UserRepository users;
  private final UserStatsRepository stats;
  private final PasswordHasher hasher;
  private final EntityManager entityManager;
  private final AccountLookup accounts;

  public AuthService(UserRepository users, UserStatsRepository stats, PasswordHasher hasher, EntityManager entityManager,
      AccountLookup accounts) {
    this.users = users;
    this.stats = stats;
    this.hasher = hasher;
    this.entityManager = entityManager;
    this.accounts = accounts;
  }

  @Transactional
  public AuthUser register(RegisterCommand cmd) {
    if (users.existsByEmailOrUsername(cmd.email(), cmd.username())) {
      throw new ConflictException(CONFLICT);
    }
    var user = UserEntity.create(UUID.randomUUID().toString(), cmd.username(), cmd.email(), hasher.hash(cmd.password()), Instant.now());
    insert(user);
    return UserIdentityMapper.identityFromUser(user);
  }

  /** Inserta usuario y estadísticas y los vuelca ya, para traducir aquí una carrera con la restricción única. */
  void insert(UserEntity user) {
    try {
      users.save(user);
      stats.save(new UserStatsEntity(user.getId()));
      entityManager.flush();
    } catch (DataAccessException | PersistenceException e) {
      if (isUniqueViolation(e)) throw new ConflictException(CONFLICT);
      throw e;
    }
  }

  private static boolean isUniqueViolation(Throwable error) {
    for (Throwable t = error; t != null; t = t.getCause()) {
      if (t instanceof SQLException sql && "23505".equals(sql.getSQLState())) return true;
      if (t.getCause() == t) break;
    }
    return false;
  }

  /**
   * Busca la cuenta con {@link AccountLookup}. El error es el mismo si la cuenta no existe o la contraseña falla, para
   * no revelar qué cuentas hay.
   */
  public AuthUser login(LoginCommand cmd) {
    return accounts.find(cmd.identifier())
        .filter(user -> hasher.matches(cmd.password(), user.getPasswordHash()))
        .map(UserIdentityMapper::identityFromUser)
        .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));
  }

  public AuthUser guest(GuestCommand cmd) {
    return guest(cmd.displayName(), new AvatarRef.Default());
  }

  /** {@code guestIdentity(displayName, avatar)} de Node: id nuevo en cada llamada. */
  public AuthUser guest(String displayName, AvatarRef avatar) {
    return new AuthUser("guest_" + UUID.randomUUID(), displayName, AuthUser.Kind.GUEST, null, null, avatar);
  }
}
