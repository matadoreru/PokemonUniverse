package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.identity.AuthUser;

/** {@code SessionParticipant}: identidad y puntos de sesión, que sobreviven a la salida del miembro. */
public final class SessionParticipant {

  public AuthUser identity;
  public int sessionPoints;

  public SessionParticipant(AuthUser identity, int sessionPoints) {
    this.identity = identity;
    this.sessionPoints = sessionPoints;
  }
}
