package es.pokemonuniverse.application.ports;

/** Convierte la imagen subida en el avatar WebP de 256×256 (equivale a la cadena de sharp de Node). */
public interface AvatarImageEncoder {

  /**
   * Valida formato y dimensiones sin decodificar la imagen entera y devuelve el WebP final.
   *
   * @param declaredContentType cabecera {@code Content-Type} tal cual; debe coincidir exactamente con el formato real
   * @throws es.pokemonuniverse.application.avatar.AvatarValidationException si la imagen no es aceptable
   */
  byte[] toAvatarWebp(byte[] contents, String declaredContentType);
}
