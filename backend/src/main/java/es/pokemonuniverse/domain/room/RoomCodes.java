package es.pokemonuniverse.domain.room;

import java.util.function.IntUnaryOperator;

/** Códigos de sala de {@code manager.ts}: 6 caracteres del alfabeto sin 0/O/1/I. */
public final class RoomCodes {

  public static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  public static final int LENGTH = 6;

  private RoomCodes() {}

  /** {@code roomCode()}: {@code randomInt(bound)} da un entero en {@code [0, bound)}. */
  public static String generate(IntUnaryOperator randomInt) {
    var code = new StringBuilder(LENGTH);
    for (int i = 0; i < LENGTH; i++) code.append(ALPHABET.charAt(randomInt.applyAsInt(ALPHABET.length())));
    return code.toString();
  }

}
