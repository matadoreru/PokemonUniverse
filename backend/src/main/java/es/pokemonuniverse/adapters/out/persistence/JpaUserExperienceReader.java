package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.rooms.UserExperienceReader;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import jakarta.inject.Singleton;
import javax.sql.DataSource;

/** Lee la columna {@code xp} de "UserStats"; una cuenta sin fila aún no ha ganado nada. */
@Singleton
@Requires(beans = DataSource.class)
public class JpaUserExperienceReader implements UserExperienceReader {

  private final UserRepository users;
  private final UserStatsRepository stats;

  public JpaUserExperienceReader(UserRepository users, UserStatsRepository stats) {
    this.users = users;
    this.stats = stats;
  }

  @Override
  public @Nullable Integer xpOf(String userId) {
    var row = stats.findById(userId);
    if (row.isPresent()) return row.get().getXp();
    return users.existsById(userId) ? 0 : null;
  }
}
