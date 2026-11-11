package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import java.util.List;
import java.util.function.DoubleSupplier;
import org.junit.jupiter.api.Test;

class AssetTokensTest {

  /** Cuenta las extracciones de la fuente de azar que envuelve. */
  private static final class CountingRandom implements DoubleSupplier {
    private final DoubleSupplier source;
    int draws;

    CountingRandom(DoubleSupplier source) {
      this.source = source;
    }

    @Override
    public double getAsDouble() {
      draws++;
      return source.getAsDouble();
    }
  }

  /**
   * {@code now} en base 36 y tres extracciones de Mulberry32(42) (0.6011…, 0.4482…, 0.8524…) escaladas a 32 bits, en
   * base 36 y en ese orden; ni una más, porque cada extracción cambia lo que sortea después el motor.
   */
  @Test
  void randomTokenDrawsExactlyThreeValues() {
    var random = new CountingRandom(new Mulberry32(42));
    var context = GameContext.builder(new InMemoryPokemonCatalog(List.of()), random).now(1_700_000_000_000L).build();
    assertEquals("loyw3v28-16p38n0-vubuyy-1ojumyo", AssetTokens.randomToken(context));
    assertEquals(3, random.draws);
  }

  /** El código de sala va con {@code encodeURIComponent}: el espacio pasa a {@code %20} y {@code ~} se queda. */
  @Test
  void roundAssetPathEncodesTheRoomCodeLikeJavaScript() {
    assertEquals("/api/rooms/AB%20C~1/games/tok-1/rounds/2/options/reveal/sprite",
        AssetTokens.roundAssetPath("AB C~1", "tok-1", 2, "reveal", "sprite"));
    assertEquals("/api/rooms/opaque/games/tok-1/rounds/10/options/cry/audio",
        AssetTokens.roundAssetPath("opaque", "tok-1", 10, "cry", "audio"));
  }
}
