package es.pokemonuniverse.domain.progression;

/**
 * Experiencia y nivel de las cuentas registradas (los invitados no tienen). Solo se guarda la experiencia total; el
 * nivel siempre se deriva de ella.
 *
 * <p>Cada minijuego terminado da {@link #BASE_XP} por jugarlo y, si había al menos dos jugadores, un extra por la
 * posición final: 30 al primero, 20 al segundo y 10 al tercero (los empates comparten posición y extra). El
 * {@code V3__experiencia_y_nivel.sql} repite esta tabla para calcular la experiencia del historial: si cambia aquí,
 * cambia allí.
 *
 * <p>Subir del nivel {@code n} al {@code n + 1} cuesta {@code 100 + 50 (n - 1)}: 100, 150, 200… Así el nivel
 * {@code L} empieza en {@code 25 (L - 1) (L + 2)} puntos (nivel 2 en 100, 3 en 250, 4 en 450, 10 en 2700).
 */
public final class Experience {

  public static final int BASE_XP = 20;
  private static final int[] POSITION_BONUS = {30, 20, 10};

  private Experience() {}

  /** Progreso de un nivel: experiencia total y los umbrales del nivel actual y del siguiente. */
  public record Progress(int level, int xp, int levelXp, int nextLevelXp) {}

  /** Experiencia de una partida terminada; {@code position} empieza en 1. */
  public static int xpForGame(int position, int playerCount) {
    int bonus = playerCount >= 2 && position >= 1 && position <= POSITION_BONUS.length
        ? POSITION_BONUS[position - 1] : 0;
    return BASE_XP + bonus;
  }

  /** Suma sin desbordar el {@code integer} de la columna. */
  public static int add(int xp, int gained) {
    return (int) Math.min(Integer.MAX_VALUE, Math.max(0L, (long) xp + gained));
  }

  /** Experiencia total con la que empieza el nivel {@code level} (1 empieza en 0). */
  public static long levelStart(int level) {
    long l = Math.max(1, level);
    return 25L * (l - 1) * (l + 2);
  }

  /** Nivel de una experiencia total; una experiencia negativa cuenta como 0. */
  public static int levelFor(int xp) {
    int level = 1;
    while (levelStart(level + 1) <= xp) level += 1;
    return level;
  }

  public static Progress progress(int xp) {
    int safe = Math.max(0, xp);
    int level = levelFor(safe);
    return new Progress(level, safe, (int) levelStart(level),
        (int) Math.min(Integer.MAX_VALUE, levelStart(level + 1)));
  }
}
