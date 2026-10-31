package es.pokemonuniverse.domain.room;

/**
 * Identidad de un temporizador ({@code NodeJS.Timeout} en TS). Se crea y se asigna a la sala o al miembro antes de
 * programarse, y el callback comprueba {@code room.transitionTimer == timer}: un callback obsoleto (ya encolado cuando
 * se canceló o se sustituyó) no aplica nada.
 */
public final class RoomTimer {

  private volatile Runnable cancel = () -> {};
  private volatile boolean cancelled;

  /** Enlaza la cancelación real del planificador. */
  public void bind(Runnable cancelAction) {
    cancel = cancelAction;
    if (cancelled) cancelAction.run();
  }

  public void cancel() {
    cancelled = true;
    cancel.run();
  }

  /** {@code cancelTimer(timer)}: cancela si existe y devuelve {@code null}. */
  public static RoomTimer cancel(RoomTimer timer) {
    if (timer != null) timer.cancel();
    return null;
  }
}
