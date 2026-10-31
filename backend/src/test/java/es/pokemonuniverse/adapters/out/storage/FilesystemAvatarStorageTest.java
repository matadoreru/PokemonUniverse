package es.pokemonuniverse.adapters.out.storage;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FilesystemAvatarStorageTest {

  @TempDir Path dir;

  private FilesystemAvatarStorage storage() {
    return new FilesystemAvatarStorage(dir);
  }

  private static String name() {
    return UUID.randomUUID() + ".webp";
  }

  @Test
  void readsExistingWebp() throws IOException {
    var file = name();
    Files.write(dir.resolve(file), new byte[] {1, 2, 3});
    assertArrayEquals(new byte[] {1, 2, 3}, storage().read(file).orElseThrow());
  }

  @Test
  void missingIsEmpty() {
    assertTrue(storage().read(name()).isEmpty());
  }

  @Test
  void rejectsTraversalName() {
    assertThrows(IllegalArgumentException.class, () -> storage().read("../x.webp"));
    assertThrows(IllegalArgumentException.class, () -> storage().remove("../x.webp"));
  }

  @Test
  void rejectsNonWebpName() {
    assertThrows(IllegalArgumentException.class, () -> storage().read("abc.png"));
  }

  @Test
  void removeDeletesAndIsIdempotent() throws IOException {
    var file = name();
    Files.write(dir.resolve(file), new byte[] {1});
    storage().remove(file);
    assertFalse(Files.exists(dir.resolve(file)));
    storage().remove(file);
  }
}
