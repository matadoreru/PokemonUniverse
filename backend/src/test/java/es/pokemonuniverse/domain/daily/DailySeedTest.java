package es.pokemonuniverse.domain.daily;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class DailySeedTest {

  static final byte[] KEY = "k".repeat(32).getBytes(StandardCharsets.UTF_8);
  static final LocalDate DATE = LocalDate.parse("2026-11-07");
  /**
   * Calculado aparte con {@code printf 'daily|2026-11-07' | openssl dgst -sha256 -hmac kkkk…k} (32 «k»):
   * {@code f4e11015…}, los 4 primeros bytes sin signo.
   */
  static final long FIXED_SEED = 0xf4e11015L;

  @Test
  void fixedVector() {
    assertEquals(4_108_390_421L, FIXED_SEED);
    assertEquals(FIXED_SEED, DailySeed.seed(KEY, DATE));
  }

  @Test
  void changesWithTheDateAndTheKey() {
    long seed = DailySeed.seed(KEY, DATE);
    assertNotEquals(seed, DailySeed.seed(KEY, DATE.plusDays(1)));
    assertNotEquals(seed, DailySeed.seed("j".repeat(32).getBytes(StandardCharsets.UTF_8), DATE));
  }

  @Test
  void staysInTheUnsigned32BitRange() {
    var date = LocalDate.parse("2026-01-01");
    for (int day = 0; day < 200; day++) {
      long seed = DailySeed.seed(KEY, date.plusDays(day));
      assertTrue(seed >= 0 && seed < (1L << 32), "fuera de rango: " + seed);
    }
  }

  @Test
  void fingerprintIsLowercaseSha256OfIdsJoinedByNewline() {
    // printf 'bulbasaur\nivysaur' | sha256sum
    assertEquals("fd29de62ea81a3f032ca7e392ff3735d38915cf00d0a60cfd7546aaac4c74ee4",
        CatalogFingerprint.of(List.of("bulbasaur", "ivysaur")));
    assertNotEquals(CatalogFingerprint.of(List.of("a", "b")), CatalogFingerprint.of(List.of("b", "a")));
    // printf '' | sha256sum
    assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", CatalogFingerprint.of(List.of()));
  }
}
