package es.pokemonuniverse.domain.game.engine.infra;

import java.util.function.DoubleSupplier;

/**
 * PRNG determinista {@code mulberry32}, idéntico bit a bit a {@code packages/shared/golden/prng.ts}: aritmética
 * {@code int} de Java = {@code Math.imul}/{@code | 0} de JS, y {@code >>>} sobre {@code int} = {@code >>>} de JS.
 */
public final class Mulberry32 implements DoubleSupplier {

  private int a;

  /** {@code seed >>> 0}: solo cuentan los 32 bits bajos. */
  public Mulberry32(long seed) {
    this.a = (int) seed;
  }

  @Override
  public double getAsDouble() {
    a += 0x6D2B79F5;
    int t = (a ^ (a >>> 15)) * (1 | a);
    t = (t + (t ^ (t >>> 7)) * (61 | t)) ^ t;
    return Integer.toUnsignedLong(t ^ (t >>> 14)) / 4294967296.0;
  }
}
