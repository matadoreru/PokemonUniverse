package es.pokemonuniverse.application.rooms;

import io.micronaut.core.annotation.Nullable;

/**
 * Experiencia total de una cuenta registrada para el nivel que la sala muestra en su avatar. Se lee al entrar en la
 * sala; después la sala suma en memoria lo que gana cada partida terminada.
 */
@FunctionalInterface
public interface UserExperienceReader {

  /** {@code null} si no se puede saber (sin BD o la cuenta ya no existe): la sala no muestra nivel. */
  @Nullable Integer xpOf(String userId);

  UserExperienceReader NONE = userId -> null;
}
