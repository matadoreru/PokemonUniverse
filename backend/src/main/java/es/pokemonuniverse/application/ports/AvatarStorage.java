package es.pokemonuniverse.application.ports;

import java.util.Optional;

/** Almacén de avatares personalizados; {@code filename} debe cumplir {@code ^[0-9a-f-]{36}\.webp$}. */
public interface AvatarStorage {

  /** @throws IllegalArgumentException si el nombre no es válido (sin tocar el disco). */
  Optional<byte[]> read(String filename);

  /**
   * Escritura exclusiva (falla si el fichero ya existe) con permisos 0600, creando el directorio si falta; equivale a
   * {@code writeFile(..., {flag: 'wx', mode: 0o600})} de Node.
   *
   * @throws IllegalArgumentException si el nombre no es válido (sin tocar el disco)
   */
  void write(String filename, byte[] contents);

  /** Idempotente: borrar un fichero inexistente no es un error. */
  void remove(String filename);
}
