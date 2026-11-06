package es.pokemonuniverse.adapters.out.storage;

import es.pokemonuniverse.application.ports.SpriteStorage;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Miniaturas del buscador en un directorio persistente (en producción, una carpeta dentro del volumen de avatares).
 * Escribe en un temporal del mismo directorio y lo mueve de forma atómica: un fallo a medias no deja un PNG truncado.
 */
public final class FilesystemSpriteStorage implements SpriteStorage {

  private static final Pattern NAME = Pattern.compile("^[0-9a-f]{64}\\.png$");

  private final Path dir;

  public FilesystemSpriteStorage(Path dir) {
    this.dir = dir;
  }

  @Override
  public Optional<byte[]> read(String name) {
    var path = resolve(name);
    try {
      return Optional.of(Files.readAllBytes(path));
    } catch (NoSuchFileException e) {
      return Optional.empty();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @Override
  public void write(String name, byte[] body) {
    var path = resolve(name);
    try {
      Files.createDirectories(dir);
      var temp = Files.createTempFile(dir, ".sprite-", ".tmp");
      try {
        Files.write(temp, body);
        Files.move(temp, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } finally {
        Files.deleteIfExists(temp);
      }
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private Path resolve(String name) {
    if (!NAME.matcher(name).matches()) throw new IllegalArgumentException("Invalid sprite filename");
    return dir.resolve(name);
  }
}
