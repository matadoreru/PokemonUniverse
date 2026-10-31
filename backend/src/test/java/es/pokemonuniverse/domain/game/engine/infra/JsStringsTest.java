package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class JsStringsTest {

  @Test
  void trimsEcmaScriptWhitespaceAndLineTerminators() {
    assertEquals("a b", JsStrings.trim(" ﻿\t a b  　 \n"));
    assertEquals("", JsStrings.trim("   "));
    assertEquals("x", JsStrings.trim("x"));
  }

  @Test
  void keepsCharactersThatAreNotJsWhitespace() {
    // U+200B (espacio de anchura cero) y U+180E no son WhiteSpace en ECMAScript moderno.
    assertEquals("​x᠎", JsStrings.trim("​x᠎"));
    assertFalse(JsStrings.isJsWhitespace('​'));
    assertTrue(JsStrings.isJsWhitespace(' '));
    assertTrue(JsStrings.isJsWhitespace(' '));
  }
}
