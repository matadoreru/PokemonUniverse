package es.pokemonuniverse.domain.game.engine;

import io.micronaut.core.annotation.Nullable;

/** Resultado de {@code handleAction}; {@code error} es nulo (ausente en TS) cuando la acción se acepta. */
public record GameActionResult<S>(S state, boolean accepted, @Nullable String error) {

  public static <S> GameActionResult<S> accept(S state) {
    return new GameActionResult<>(state, true, null);
  }

  public static <S> GameActionResult<S> reject(S state, String error) {
    return new GameActionResult<>(state, false, error);
  }
}
