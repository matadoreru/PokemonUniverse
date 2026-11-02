package es.pokemonuniverse.application.datasync;

import es.pokemonuniverse.application.errors.ConflictException;

/** {@code SyncAlreadyRunningError} de Node: el origen (o alguno, en {@code startAll}) ya se está sincronizando (409). */
public final class SyncAlreadyRunningException extends ConflictException {

  public SyncAlreadyRunningException(String message) {
    super(message);
  }
}
