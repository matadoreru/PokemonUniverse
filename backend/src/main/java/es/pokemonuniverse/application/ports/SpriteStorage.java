package es.pokemonuniverse.application.ports;

import java.util.Optional;

/**
 * Copia en disco de las miniaturas del buscador, para que un reinicio o un despliegue no vuelva a descargarlas.
 * {@code name} debe cumplir {@code ^[0-9a-f]{64}\.png$} (el SHA-256 de la URL de origen).
 */
public interface SpriteStorage {

  /** Vacío si no existe; @throws IllegalArgumentException si el nombre no es válido (sin tocar el disco). */
  Optional<byte[]> read(String name);

  /** Sustituye el fichero de forma atómica: nunca se lee uno a medio escribir. */
  void write(String name, byte[] body);

  /** Dónde se guardan (para los avisos). */
  String location();
}
