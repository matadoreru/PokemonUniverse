package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.data.annotation.Query;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.time.Instant;
import java.util.Optional;

@Repository
public interface UserRepository extends CrudRepository<UserEntity, String> {

  Optional<UserEntity> findByEmail(String email);

  boolean existsByEmailOrUsername(String email, String username);

  /**
   * {@code prisma.user.update({data: {avatarType, avatarValue, avatarVersion: {increment: 1}}})}: el incremento es
   * atómico en la BD y {@code updatedAt} hace de {@code @updatedAt} de Prisma.
   *
   * @return filas actualizadas (0 si el usuario ya no existe)
   */
  @Query("UPDATE UserEntity u SET u.avatarType = :type, u.avatarValue = :value, u.avatarVersion = u.avatarVersion + 1,"
      + " u.updatedAt = :now WHERE u.id = :id")
  int updateAvatar(String id, String type, @Nullable String value, Instant now);
}
