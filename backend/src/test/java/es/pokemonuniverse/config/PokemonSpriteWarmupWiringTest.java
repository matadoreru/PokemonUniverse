package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.PokemonEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonRepository;
import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * La única prueba de contexto con el precalentado encendido (test lo apaga): el bean real recorre el catálogo de la BD
 * por el {@code PokemonSpriteService} de {@code AssetBeans}, con un origen falso, sin red. Las formas no se precargan.
 */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "PokemonSpriteWarmupWiringTest")
@Property(name = "pu.sprites.warmup.enabled", value = "true")
class PokemonSpriteWarmupWiringTest {

  private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");
  private static final String DEFAULT_ID = "t12-warm-bulbasaur";
  private static final String FORM_ID = "t12-warm-raichu-alola";

  @Singleton
  @Replaces(AssetSourceLoader.class)
  @Requires(property = "spec.name", value = "PokemonSpriteWarmupWiringTest")
  static class FakeLoader implements AssetSourceLoader {
    final Set<String> calls = ConcurrentHashMap.newKeySet();

    @Override
    public LoadedAsset fetch(String source) {
      calls.add(source);
      return new LoadedAsset(new byte[] {(byte) 0x89, 'P', 'N', 'G'}, "image/png");
    }
  }

  @Inject PokemonRepository repo;
  @Inject PokemonCatalogService catalog;
  @Inject PokemonSpriteWarmupStartup startup;
  @Inject FakeLoader loader;

  @AfterEach
  void clean() {
    repo.deleteById(DEFAULT_ID);
    repo.deleteById(FORM_ID);
    catalog.refresh();
  }

  @Test
  void warmsEveryDefaultSpriteOfTheCatalog() throws Exception {
    repo.save(PokemonEntity.create(DEFAULT_ID, 9101, "t12 bulbasaur", 1, true, new String[] {},
        new String[] {"grass"}, Map.of(), NOW));
    repo.save(PokemonEntity.create(FORM_ID, 9102, "t12 raichu-alola", 7, false, new String[] {},
        new String[] {"electric"}, Map.of(), NOW));
    catalog.refresh();
    var pokemon = catalog.catalog();

    startup.start().orElseThrow().join(10_000);

    assertTrue(loader.calls.contains(pokemon.byId(DEFAULT_ID).orElseThrow().sprite()), loader.calls.toString());
    assertFalse(loader.calls.contains(pokemon.byId(FORM_ID).orElseThrow().sprite()), loader.calls.toString());
  }
}
