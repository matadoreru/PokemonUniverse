package es.pokemonuniverse.adapters.in.ws;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class WsRateLimiterTest {

  @Test
  void allowsFiftyEventsPerTenSecondWindowAndDoesNotCountRejections() {
    var now = new AtomicLong(1_000);
    var limiter = new WsRateLimiter(now::get);
    for (int i = 0; i < 50; i++) assertTrue(limiter.tryAcquire());
    assertFalse(limiter.tryAcquire());
    now.set(10_999);
    assertFalse(limiter.tryAcquire());
    now.set(11_000);
    for (int i = 0; i < 50; i++) assertTrue(limiter.tryAcquire());
    assertFalse(limiter.tryAcquire());
  }
}
