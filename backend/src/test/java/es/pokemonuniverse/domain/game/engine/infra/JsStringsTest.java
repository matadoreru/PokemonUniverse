package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class JsStringsTest {

  @Test
  void trimsEcmaScriptWhitespaceAndLineTerminators() {
    assertEquals("a b", JsStrings.trim("\u00A0\uFEFF\t a b \u2028\u3000\u202F\n"));
    assertEquals("", JsStrings.trim(" \u00A0 "));
    assertEquals("x", JsStrings.trim("x"));
  }

  @Test
  void keepsCharactersThatAreNotJsWhitespace() {
    // U+200B (espacio de anchura cero) y U+180E no son WhiteSpace en ECMAScript moderno.
    assertEquals("\u200Bx\u180E", JsStrings.trim("\u200Bx\u180E"));
    assertFalse(JsStrings.isJsWhitespace('\u200B'));
    assertTrue(JsStrings.isJsWhitespace('\u2007'));
    assertTrue(JsStrings.isJsWhitespace('\u1680'));
  }

  @Test
  void truthyIsBooleanOfAJsString() {
    assertFalse(JsStrings.truthy(null));
    assertFalse(JsStrings.truthy(""));
    assertTrue(JsStrings.truthy(" "));
    assertTrue(JsStrings.truthy("0"));
  }
}
