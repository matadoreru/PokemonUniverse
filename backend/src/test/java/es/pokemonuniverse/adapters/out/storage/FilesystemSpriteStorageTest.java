package es.pokemonuniverse.adapters.out.storage;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FilesystemSpriteStorageTest {

  private static final String NAME = "a".repeat(64) + ".png";

  @TempDir
  Path dir;

  @Test
  void writesCreatingTheDirectoryAndReadsBack() {
    var storage = new FilesystemSpriteStorage(dir.resolve("sprite-cache"));

    assertTrue(storage.read(NAME).isEmpty());
    storage.write(NAME, new byte[] {1, 2});
    storage.write(NAME, new byte[] {3});

    assertArrayEquals(new byte[] {3}, storage.read(NAME).orElseThrow());
  }

  @Test
  void leavesNoTemporaryFilesBehind() throws Exception {
    var target = dir.resolve("sprite-cache");
    new FilesystemSpriteStorage(target).write(NAME, new byte[] {1});

    try (Stream<Path> files = Files.list(target)) {
      assertEquals(List.of(NAME), files.map(p -> p.getFileName().toString()).toList());
    }
  }

  @Test
  void rejectsNamesOutsideTheCache() {
    var storage = new FilesystemSpriteStorage(dir);

    assertThrows(IllegalArgumentException.class, () -> storage.read("../avatar.webp"));
    assertThrows(IllegalArgumentException.class, () -> storage.write("x.png", new byte[] {1}));
  }
}
