package es.pokemonuniverse.application.pokemon;

import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.ports.SpriteStorage;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Origen de las miniaturas del buscador con copia en disco: lee el PNG guardado antes de ir al origen y guarda lo que
 * descarga. La clave es el SHA-256 de la URL, así que si una sincronización cambia el sprite de un Pokémon se descarga
 * el nuevo. Solo se guardan PNG válidos (cabecera PNG) y los fallos del disco nunca rompen la descarga: se registran
 * y se va al origen. Si una escritura falla (p. ej. un compose antiguo sin {@code SPRITE_CACHE_DIR} y la raíz de solo
 * lectura), avisa una sola vez y no vuelve a escribir en todo el proceso; las lecturas siguen.
 */
public final class StoredSpriteSourceLoader implements AssetSourceLoader {

  private static final String PNG = "image/png";
  private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
  private static final Logger LOG = LoggerFactory.getLogger(StoredSpriteSourceLoader.class);

  private final AssetSourceLoader origin;
  private final SpriteStorage storage;
  private final Consumer<String> warn;
  private final AtomicBoolean writesDisabled = new AtomicBoolean();

  public StoredSpriteSourceLoader(AssetSourceLoader origin, SpriteStorage storage) {
    this(origin, storage, LOG::warn);
  }

  /** {@code warn} solo existe para que las pruebas cuenten los avisos. */
  StoredSpriteSourceLoader(AssetSourceLoader origin, SpriteStorage storage, Consumer<String> warn) {
    this.origin = origin;
    this.storage = storage;
    this.warn = warn;
  }

  @Override
  public LoadedAsset fetch(String source) {
    var name = name(source);
    try {
      var stored = storage.read(name);
      if (stored.isPresent() && isPng(stored.get())) return new LoadedAsset(stored.get(), PNG);
    } catch (RuntimeException e) {
      LOG.warn("Failed to read stored sprite: {}", e.toString());
    }
    var downloaded = origin.fetch(source);
    // La cabecera del origen llega tal cual: puede traer parámetros o mayúsculas.
    if (!writesDisabled.get() && downloaded.contentType().toLowerCase(Locale.ROOT).startsWith(PNG)
        && isPng(downloaded.body())) {
      try {
        storage.write(name, downloaded.body());
      } catch (RuntimeException e) {
        if (writesDisabled.compareAndSet(false, true)) {
          warn.accept("Sprite disk cache disabled: cannot write to " + storage.location() + " (" + e
              + "). Set SPRITE_CACHE_DIR to a directory inside a writable volume; sprites stay in memory only.");
        }
      }
    }
    return downloaded;
  }

  static String name(String source) {
    try {
      var digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest) + ".png";
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static boolean isPng(byte[] body) {
    return body.length > PNG_SIGNATURE.length
        && Arrays.equals(body, 0, PNG_SIGNATURE.length, PNG_SIGNATURE, 0, PNG_SIGNATURE.length);
  }
}
