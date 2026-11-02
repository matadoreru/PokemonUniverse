package es.pokemonuniverse.application.avatar;

import es.pokemonuniverse.application.ports.AvatarImageEncoder;
import es.pokemonuniverse.application.ports.AvatarStorage;
import es.pokemonuniverse.domain.identity.AvatarRef;
import jakarta.inject.Singleton;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** {@code apps/server/src/avatar/service.ts}: procesa la imagen subida y la guarda como {@code <uuid>.webp}. */
@Singleton
public class AvatarService {

  /** {@code MAX_AVATAR_UPLOAD_BYTES} de Node: 5 MiB. */
  public static final int MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  public static final String TOO_BIG = "La imagen supera el límite de 5 MB.";
  public static final String INVALID_IMAGE = "El archivo no es una imagen JPEG, PNG o WEBP válida.";
  public static final String INVALID_DIMENSIONS = "La imagen debe medir entre 64 y 4096 píxeles por lado.";

  private static final Logger LOG = LoggerFactory.getLogger(AvatarService.class);

  private final AvatarImageEncoder encoder;
  private final AvatarStorage storage;

  public AvatarService(AvatarImageEncoder encoder, AvatarStorage storage) {
    this.encoder = encoder;
    this.storage = storage;
  }

  /**
   * Valida, convierte y guarda. La versión es la hora actual como en Node; para usuarios registrados la que cuenta es
   * {@code avatarVersion} de la BD.
   */
  public AvatarRef.Custom processAndStore(byte[] contents, String declaredContentType) {
    if (contents == null || contents.length == 0 || contents.length > MAX_UPLOAD_BYTES) {
      throw new AvatarValidationException(TOO_BIG);
    }
    byte[] webp = encoder.toAvatarWebp(contents, declaredContentType);
    var filename = UUID.randomUUID() + ".webp";
    storage.write(filename, webp);
    return new AvatarRef.Custom(filename, System.currentTimeMillis());
  }

  /** Borrado que nunca falla ({@code avatarService.remove(...).catch(() => undefined)} de Node). */
  public void remove(String filename) {
    try {
      storage.remove(filename);
    } catch (RuntimeException e) {
      LOG.warn("Could not remove avatar {}", filename, e);
    }
  }
}
