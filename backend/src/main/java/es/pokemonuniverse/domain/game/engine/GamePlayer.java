package es.pokemonuniverse.domain.game.engine;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/**
 * Jugador visto por un motor. {@code connected}/{@code active} nulos valen {@code true}, como los opcionales de
 * TypeScript; {@code active == false} marca espectadores e identidades cuya gracia de reconexión expiró.
 */
@Serdeable
public record GamePlayer(String id, String displayName, @Nullable Boolean connected, @Nullable Boolean active) {

  public GamePlayer(String id, String displayName) {
    this(id, displayName, null, null);
  }

  /** {@code connected !== false && active !== false}. */
  public boolean isRequired() {
    return !Boolean.FALSE.equals(connected) && !Boolean.FALSE.equals(active);
  }
}
