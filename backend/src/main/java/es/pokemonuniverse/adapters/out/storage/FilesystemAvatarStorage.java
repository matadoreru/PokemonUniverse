package es.pokemonuniverse.adapters.out.storage;

import es.pokemonuniverse.application.ports.AvatarStorage;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.identity.AvatarRef;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.Optional;

/** Lee y borra avatares del directorio compartido con el servidor Node (volumen Docker). */
@Singleton
public class FilesystemAvatarStorage implements AvatarStorage {

  private final Path dir;

  @Inject
  public FilesystemAvatarStorage(PuConfig config) {
    this(Path.of(config.avatarStorageDir()));
  }

  FilesystemAvatarStorage(Path dir) {
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
