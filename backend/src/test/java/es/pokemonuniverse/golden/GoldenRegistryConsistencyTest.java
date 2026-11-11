package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.game.GameManifest;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Los motores portados de producción ({@code ClasspathGameRegistryLoader}) y los directorios de fixtures doradas
 * coinciden: ni fixtures de un motor que producción no registra ni un motor registrado sin fixtures.
 */
class GoldenRegistryConsistencyTest {

  private static List<String> goldenDirectories() throws IOException, URISyntaxException {
    var root = Path.of(GoldenRegistryConsistencyTest.class.getResource("/golden").toURI());
    try (var dirs = Files.list(root)) {
      return dirs.filter(Files::isDirectory).map(dir -> dir.getFileName().toString())
          .filter(name -> !name.equals("catalog")).sorted().toList();
    }
  }

  @Test
  void everyGoldenDirectoryIsAPortedEngineAndViceVersa() throws IOException, URISyntaxException {
    var registry = GoldenManifests.registry();
    var golden = goldenDirectories();
    var notPorted = golden.stream().filter(id -> registry.engine(id).isEmpty()).toList();
    assertEquals(List.of(), notPorted, "Fixtures doradas de motores que producción no registra");
    var ported = registry.list().stream().map(GameManifest::id).filter(id -> registry.engine(id).isPresent()).sorted().toList();
    var withoutGolden = ported.stream().filter(id -> !golden.contains(id)).toList();
    assertEquals(List.of(), withoutGolden, "Motores registrados en producción sin fixtures doradas");
  }
}
