package es.pokemonuniverse.adapters.out.persistence;

import java.io.IOException;
import java.io.Reader;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystem;
import java.nio.file.FileSystemAlreadyExistsException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.api.ResourceProvider;
import org.flywaydb.core.api.resource.LoadableResource;

/**
 * Migraciones de Flyway dentro de un binario nativo. El escáner de Flyway recorre el classpath por protocolo y solo
 * trae lectores para {@code file:}, {@code jar:}, JBoss y OSGi, no para {@code resource:}, el de los recursos
 * empaquetados por native-image. Aquí se listan con el sistema de archivos {@code resource:/} de GraalVM. Solo se usa
 * en el binario nativo ({@link FlywayMigrations}); en la JVM escanea Flyway, como siempre.
 */
final class NativeMigrationResources implements ResourceProvider {

  static final String LOCATION = "db/migration";

  private final List<Migration> migrations;

  private NativeMigrationResources(List<Migration> migrations) {
    this.migrations = migrations;
  }

  /** Lee las migraciones empaquetadas; falla si no hay ninguna (el binario se compiló sin sus recursos). */
  static NativeMigrationResources load() {
    return load(resourceFileSystem().getPath(LOCATION));
  }

  static NativeMigrationResources load(Path directory) {
    var found = new ArrayList<Migration>();
    try (var files = Files.list(directory)) {
      for (Path file : files.sorted().toList()) {
        if (!Files.isRegularFile(file)) continue;
        var name = file.getFileName().toString();
        found.add(new Migration(name, Files.readString(file, StandardCharsets.UTF_8)));
      }
    } catch (IOException e) {
      throw new UncheckedIOException("No se pueden leer las migraciones empaquetadas en " + LOCATION, e);
    }
    if (found.isEmpty()) throw new IllegalStateException("El binario no contiene migraciones en " + LOCATION);
    return new NativeMigrationResources(List.copyOf(found));
  }

  private static FileSystem resourceFileSystem() {
    var root = URI.create("resource:/");
    try {
      return FileSystems.newFileSystem(root, Map.of());
    } catch (FileSystemAlreadyExistsException e) {
      return FileSystems.getFileSystem(root);
    } catch (IOException e) {
      throw new UncheckedIOException("No se puede abrir el sistema de archivos de recursos del binario", e);
    }
  }

  @Override
  public LoadableResource getResource(String name) {
    return migrations.stream().filter(m -> m.getAbsolutePath().equals(name) || m.getFilename().equals(name))
        .findFirst().orElse(null);
  }

  /** Como el escáner de Flyway: por prefijo y sufijo del nombre de archivo ({@code V}, {@code .sql}). */
  @Override
  public Collection<LoadableResource> getResources(String prefix, String[] suffixes) {
    return migrations.stream()
        .filter(m -> m.getFilename().startsWith(prefix)
            && Arrays.stream(suffixes).anyMatch(suffix -> m.getFilename().endsWith(suffix)))
        .map(LoadableResource.class::cast)
        .toList();
  }

  private static final class Migration extends LoadableResource {

    private final String filename;
    private final String contents;

    Migration(String filename, String contents) {
      this.filename = filename;
      this.contents = contents;
    }

    @Override
    public Reader read() {
      return new StringReader(contents);
    }

    @Override
    public String getAbsolutePath() {
      return LOCATION + "/" + filename;
    }

    @Override
    public String getAbsolutePathOnDisk() {
      return getAbsolutePath();
    }

    @Override
    public String getFilename() {
      return filename;
    }

    @Override
    public String getRelativePath() {
      return filename;
    }

    @Override
    public String toString() {
      return getAbsolutePath();
    }
  }
}
