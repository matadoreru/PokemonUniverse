package es.pokemonuniverse.application.time;

import jakarta.inject.Singleton;
import java.security.SecureRandom;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/** Azar de producción: {@code Math.random} no criptográfico; códigos de sala con {@link SecureRandom} como Node. */
@Singleton
public class SystemRandomSource implements RandomSource {

  private final SecureRandom secure = new SecureRandom();

  @Override
  public double next() {
    return ThreadLocalRandom.current().nextDouble();
  }

  @Override
  public String uuid() {
    return UUID.randomUUID().toString();
  }

  @Override
  public int nextInt(int bound) {
    return secure.nextInt(bound);
  }
}
