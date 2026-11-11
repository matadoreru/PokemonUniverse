package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Ficheros de {@code src/test/resources/web-contracts/}: lo que la web copia de Java (puntuación que muestra, juegos y
 * reglas del reto diario, textos de condición). Los graba un test Java y los lee un test de {@code packages/shared},
 * que comprueba que la copia TS dice lo mismo. Se regeneran con
 * {@code ./gradlew test -DupdateWebContracts=true --tests '<el test que lo graba>'}, una propiedad propia para no
 * regrabar las doradas a la vez; el diff es el cambio que tiene que seguir la web.
 */
public final class WebContracts {

  private static final Path DIR = Path.of("src/test/resources/web-contracts");
  private static final boolean UPDATE = Boolean.getBoolean("updateWebContracts");

  private WebContracts() {}

  /** Compara {@code value} (como lo serializa Serde, en JSON de dos espacios) con {@code file}, o lo graba. */
  public static void check(String file, Object value) throws IOException {
    var actual = GoldenRecorder.stringify(GoldenReplayer.tree(value));
    var path = DIR.resolve(file);
    if (UPDATE) {
      Files.createDirectories(DIR);
      Files.writeString(path, actual);
      return;
    }
    var recorded = Files.exists(path) ? Files.readString(path) : "";
    assertEquals(recorded, actual,
        file + ": regenera con -DupdateWebContracts=true si el cambio es intencionado y cambia la web");
  }
}
