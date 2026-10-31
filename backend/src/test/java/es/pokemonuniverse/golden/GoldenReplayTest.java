package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.fail;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import io.micronaut.core.type.Argument;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/** Un test por fixture {@code golden/<engineId>/*.json} y por caso de {@code config-cases.json}. */
class GoldenReplayTest {

  private static final String CONFIG_CASES = "config-cases.json";
  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();

  @TestFactory
  Stream<DynamicTest> goldenFixtures() throws IOException, URISyntaxException {
    var root = Path.of(getClass().getResource("/golden").toURI());
    List<Path> engineDirs;
    try (var dirs = Files.list(root)) {
      engineDirs = dirs.filter(Files::isDirectory).filter(dir -> !dir.getFileName().toString().equals("catalog"))
          .sorted().toList();
    }
    return engineDirs.stream().flatMap(dir -> tests(dir.getFileName().toString(), dir));
  }

  private static Stream<DynamicTest> tests(String engineId, Path dir) {
    List<Path> files;
    try (var list = Files.list(dir)) {
      files = list.filter(file -> file.getFileName().toString().endsWith(".json")).sorted().toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return files.stream().flatMap(file -> file.getFileName().toString().equals(CONFIG_CASES)
        ? configCaseTests(engineId, file) : Stream.of(scenarioTest(engineId, file)));
  }

  private static DynamicTest scenarioTest(String engineId, Path file) {
    var name = file.getFileName().toString().replaceFirst("\\.json$", "");
    return dynamicTest(engineId + "/" + name, () -> {
      var engine = GoldenEngines.get(engineId).orElseGet(() -> fail("Motor no portado: " + engineId));
      var fixture = MAPPER.readValue(Files.readString(file), GoldenFixture.class);
      GoldenReplayer.replay(engine, fixture, GoldenCatalogs.load(fixture.catalog()));
    });
  }

  private static Stream<DynamicTest> configCaseTests(String engineId, Path file) {
    List<GoldenFixture.ConfigCase> cases;
    try {
      cases = MAPPER.readValue(Files.readString(file), Argument.listOf(GoldenFixture.ConfigCase.class));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return Stream.iterate(0, i -> i + 1).limit(cases.size()).map(i -> {
      var name = engineId + "/config-cases[" + i + "]";
      return dynamicTest(name, () -> {
        var engine = GoldenEngines.get(engineId).orElseGet(() -> fail("Motor no portado: " + engineId));
        GoldenReplayer.checkConfigCase(engine, name, cases.get(i));
      });
    });
  }
}
