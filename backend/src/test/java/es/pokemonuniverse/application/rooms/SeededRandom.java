package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import java.util.concurrent.atomic.AtomicLong;

/** Azar determinista: {@code mulberry32(seed)} para {@code Math.random} y UUID v4 secuenciales. */
final class SeededRandom implements RandomSource {

  private final Mulberry32 prng;
  private final AtomicLong uuids = new AtomicLong();

  SeededRandom(long seed) {
    this.prng = new Mulberry32(seed);
  }

  @Override
  public synchronized double next() {
    return prng.getAsDouble();
  }

  @Override
  public String uuid() {
    return String.format("00000000-0000-4000-8000-%012d", uuids.incrementAndGet());
  }

  @Override
  public int nextInt(int bound) {
    return (int) Math.floor(next() * bound);
  }
}
