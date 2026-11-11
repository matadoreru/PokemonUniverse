package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.PokemonEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonRepository;
import es.pokemonuniverse.adapters.out.storage.FilesystemArtworkCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.data.model.Sort;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * El buscador ({@code /api/pokemon/selector}) y sus miniaturas leen solo la tabla de Pokémon: el servicio se monta sin
 * repositorios de movimientos, learnsets, Pokédex ni evoluciones (null), así que cualquier carga completa fallaría.
 */
class PokemonCatalogServiceSelectorTest {

  private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

  private final List<String> calls = new ArrayList<>();

  /** Solo responde a {@code findAll(Sort)}; cualquier otro método del repositorio rompe la prueba. */
  private PokemonRepository pokemonRows(List<PokemonEntity> rows) {
    return (PokemonRepository) Proxy.newProxyInstance(PokemonRepository.class.getClassLoader(),
        new Class<?>[] {PokemonRepository.class}, (proxy, method, args) -> {
          calls.add(method.getName());
          if (method.getName().equals("findAll") && args != null && args.length == 1 && args[0] instanceof Sort) {
            return rows;
          }
          throw new AssertionError("consulta inesperada: " + method);
        });
  }

  private static PokemonEntity row(String id, int dex, String name, boolean isDefault) {
    return PokemonEntity.create(id, dex, name, 1, isDefault, new String[0], new String[] {"normal"}, null, NOW);
  }

  @Test
  void selectorAndSpritesLoadOnlyThePokemonTable() {
    var repository = pokemonRows(List.of(
        row("bulbasaur", 1, "bulbasaur", true),
        row("ivysaur", 2, "ivysaur", true),
        // Mismo número que un defecto ya visto: el filtro del catálogo lo descarta, como en la carga completa.
        row("bulbasaur-dup", 1, "bulbasaur", true),
        // Forma no admitida: tampoco entra.
        row("ivysaur-gmax", 2, "ivysaur", false)));
    var service = new PokemonCatalogService(repository, null, null, null, null, null,
        ids -> new FilesystemArtworkCatalog(Path.of("/tmp/sin-artworks"), ids));

    var ids = service.selectorSearch(new PokemonSearchQuery(List.of(), true)).stream().map(Pokemon::id).toList();

    assertEquals(List.of("bulbasaur", "ivysaur"), ids);
    assertTrue(service.selectorCatalog().byId("ivysaur").isPresent());
    assertTrue(service.selectorCatalog().byId("ivysaur-gmax").isEmpty());
    assertEquals(List.of("findAll"), calls, "una sola lectura de la tabla de Pokémon, cacheada");
  }
}
