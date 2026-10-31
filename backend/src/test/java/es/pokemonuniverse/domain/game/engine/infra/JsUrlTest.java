package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/** Valores comprobados con {@code encodeURIComponent} de Node. */
class JsUrlTest {

  @Test
  void encodesSpacesSlashesAndNonAsciiAsUtf8() {
    assertEquals("A%20B%2F%C3%BC", JsUrl.encodeURIComponent("A B/ü"));
  }

  @Test
  void leavesTheJsUnreservedSetUntouched() {
    assertEquals("!'()*~", JsUrl.encodeURIComponent("!'()*~"));
    assertEquals("AZaz09-_.", JsUrl.encodeURIComponent("AZaz09-_."));
  }

  @Test
  void encodesTheReservedSetThatUrlEncoderTreatsDifferently() {
    assertEquals("%2B%26%3D%3F%23%25%3A%40%24%2C%3B", JsUrl.encodeURIComponent("+&=?#%:@$,;"));
    assertEquals("%F0%9F%98%80", JsUrl.encodeURIComponent("😀"));
    assertEquals("", JsUrl.encodeURIComponent(""));
  }

  @Test
  void rejectsALoneSurrogateLikeUriError() {
    assertThrows(IllegalArgumentException.class, () -> JsUrl.encodeURIComponent("a\uD800b"));
  }
}
