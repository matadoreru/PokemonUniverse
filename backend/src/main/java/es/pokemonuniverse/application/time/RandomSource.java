package es.pokemonuniverse.application.time;

/** Azar inyectado: {@code Math.random}, {@code randomUUID} y {@code randomInt} de Node. */
public interface RandomSource {

  /** En {@code [0, 1)}, como {@code Math.random()}. */
  double next();

  /** UUID v4 en minúsculas, como {@code crypto.randomUUID()}. */
  String uuid();

  /** Entero en {@code [0, bound)}, como {@code crypto.randomInt(bound)}. */
  int nextInt(int bound);
}
