package es.pokemonuniverse.domain.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Registro puro: sin contexto de Micronaut ni ficheros (la carga del classpath se prueba en su adaptador). */
class GameRegistryTest {

  private static GameManifest game(String id, Boolean recommended) {
    return new GameManifest(id, id.toUpperCase(), "x", "d", null, recommended, 1, null, null,
        new GameManifest.ProfileStatsDefinition(List.of(), null), Map.of());
  }

  private final GameRegistry registry = new GameRegistry(List.of(
      game("a", null), game("b", true), game("c", false), game("d", true)));

  @Test
  void listKeepsFileOrder() {
    assertEquals(List.of("a", "b", "c", "d"), registry.list().stream().map(GameManifest::id).toList());
  }

  @Test
  void manifestsPutRecommendedFirstAndKeepOrder() {
    assertEquals(List.of("b", "d", "a", "c"), registry.manifests().stream().map(GameManifest::id).toList());
  }

  @Test
  void getFindsByIdAndUnknownIsEmpty() {
    assertEquals("C", registry.get("c").orElseThrow().name());
    assertTrue(registry.get("no-existe").isEmpty());
  }

  @Test
  void duplicateIdsAreRejected() {
    var games = List.of(game("a", null), game("a", true));
    assertThrows(IllegalStateException.class, () -> new GameRegistry(games));
  }
}
