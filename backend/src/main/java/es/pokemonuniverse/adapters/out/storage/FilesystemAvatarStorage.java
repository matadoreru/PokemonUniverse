package es.pokemonuniverse.adapters.out.storage;

import es.pokemonuniverse.application.ports.AvatarStorage;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.identity.AvatarRef;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Optional;
import java.util.Set;

/** Lee, escribe y borra avatares del directorio compartido con el servidor Node (volumen Docker). */
@Singleton
public class FilesystemAvatarStorage implements AvatarStorage {

  private final Path dir;

  @Inject
  public FilesystemAvatarStorage(PuConfig config) {
    this(Path.of(config.avatarStorageDir()));
  }

  public FilesystemAvatarStorage(Path dir) {
    this.dir = dir;
  }

  @Override
  public Optional<byte[]> read(String filename) {
    var path = resolve(filename);
    try {
      return Optional.of(Files.readAllBytes(path));
    } catch (NoSuchFileException e) {
      return Optional.empty();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @Override
  public void write(String filename, byte[] contents) {
    var path = resolve(filename);
    try {
      Files.createDirectories(dir);
      // CREATE_NEW con el modo en la propia creación: nunca existe el fichero con otros permisos ni se pisa uno ajeno.
      try (var channel = Files.newByteChannel(path, Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE),
          PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")))) {
        var buffer = ByteBuffer.wrap(contents);
        while (buffer.hasRemaining()) channel.write(buffer);
      }
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @Override
  public void remove(String filename) {
    try {
      Files.deleteIfExists(resolve(filename));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private Path resolve(String filename) {
    if (!AvatarRef.isValidCustomFile(filename)) throw new IllegalArgumentException("Invalid avatar filename");
    return dir.resolve(filename);
  }
}
