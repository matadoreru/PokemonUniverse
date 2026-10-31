package es.pokemonuniverse.application.ports;

import java.util.Optional;

/** Almacén de avatares personalizados; {@code filename} debe cumplir {@code ^[0-9a-f-]{36}\.webp$}. */
public interface AvatarStorage {

  /** @throws IllegalArgumentException si el nombre no es válido (sin tocar el disco). */
  Optional<byte[]> read(String filename);

  /** Idempotente: borrar un fichero inexistente no es un error. */
  void remove(String filename);
}
