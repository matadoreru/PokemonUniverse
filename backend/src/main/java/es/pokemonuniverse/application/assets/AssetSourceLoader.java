package es.pokemonuniverse.application.assets;

/** Puerto de salida: descarga una fuente autorizada ({@code sourceBuffer} de {@code game-image-cache.ts}). */
public interface AssetSourceLoader {

  /** Lanza una excepción con el mensaje de Node si la fuente no es de confianza o el origen falla. */
  LoadedAsset fetch(String source);
}
