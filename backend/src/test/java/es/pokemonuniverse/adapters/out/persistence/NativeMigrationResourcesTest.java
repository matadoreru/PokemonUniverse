package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.StringWriter;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.flywaydb.core.api.resource.LoadableResource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** El proveedor de migraciones del binario nativo, sobre el directorio real de migraciones (aquí, en disco). */
class NativeMigrationResourcesTest {

  private static Path migrations() throws URISyntaxException {
    var url = NativeMigrationResourcesTest.class.getClassLoader().getResource(NativeMigrationResources.LOCATION);
    assertNotNull(url);
    return Path.of(url.toURI());
  }

  @Test
  void listsEveryVersionedMigrationOnce() throws Exception {
    List<String> expected;
    try (var files = Files.list(migrations())) {
      expected = files.map(file -> file.getFileName().toString()).filter(name -> name.startsWith("V") && name.endsWith(".sql"))
          .sorted().toList();
    }
    var provider = NativeMigrationResources.load(migrations());
    var found = provider.getResources("V", new String[] {".sql"}).stream().map(LoadableResource::getFilename).sorted().toList();
    assertEquals(expected, found);
    assertTrue(found.contains("V1__baseline.sql"));
    assertTrue(provider.getResources("R", new String[] {".sql"}).isEmpty());
    assertTrue(provider.getResources("V", new String[] {".java"}).isEmpty());
  }

  @Test
  void resourceKeepsItsContentsAndPaths() throws Exception {
    var provider = NativeMigrationResources.load(migrations());
    var baseline = provider.getResource("db/migration/V1__baseline.sql");
    assertNotNull(baseline);
    assertEquals("V1__baseline.sql", baseline.getFilename());
    assertEquals("V1__baseline.sql", baseline.getRelativePath());
    try (var reader = baseline.read()) {
      var contents = new StringWriter();
      reader.transferTo(contents);
      assertEquals(Files.readString(migrations().resolve("V1__baseline.sql"), StandardCharsets.UTF_8), contents.toString());
    }
    assertNull(provider.getResource("db/migration/V0__no_existe.sql"));
  }

  @Test
  void failsWhenTheBinaryHasNoMigrations(@TempDir Path empty) throws IOException {
    assertThrows(IllegalStateException.class, () -> NativeMigrationResources.load(empty));
  }
}
