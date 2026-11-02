package es.pokemonuniverse.application.datasync.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;

import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncScheduler;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.PokemonPaletteCount;
import io.micronaut.context.BeanContext;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.test.support.TestPropertyProvider;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Review Focus 1 (dos procesos sincronizando la misma BD): con {@code pu.data-sync.enabled=false} (el valor por
 * defecto) el contexto arranca con el adaptador de PokéAPI registrado, pero ni {@code ensureInitialPokemon} ni el
 * planificador hacen nada: la PokéAPI embebida no recibe ninguna petición y no hay temporizador armado.
 */
@MicronautTest(transactional = false)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PokemonDataSyncWiringTest implements TestPropertyProvider {

  private final PokeApiFixtureServer server;

  @Inject BeanContext context;

  PokemonDataSyncWiringTest() {
    try {
      server = new PokeApiFixtureServer();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @Override
  public Map<String, String> getProperties() {
    return Map.of("pu.data-sync.pokeapi-base-url", server.urls().base(),
        "pu.data-sync.sprite-base-url", server.spriteBase());
  }

  @AfterAll
  void stopServer() {
    server.close();
  }

  @Test
  void thePokeApiAdapterAndPaletteCountAreBeans() {
    var adapters = context.getBeansOfType(DataSyncAdapter.class).stream()
        .filter(adapter -> adapter.source() == DataSyncSource.POKEAPI).toList();
    assertEquals(1, adapters.size());
    assertInstanceOf(PokemonDataSync.class, adapters.getFirst());
    assertSame(context.getBean(PokemonPaletteSync.class), context.getBean(PokemonPaletteCount.class));
  }

  @Test
  void disabledStartupNeverCallsPokeApiNorArmsATimer() {
    assertFalse(context.getBean(DataSyncScheduler.class).running());
    assertFalse(context.getBean(DataSyncService.class).isRunning());
    assertEquals(List.of(), server.requests());
  }
}
