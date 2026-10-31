package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog.CryVersion;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class JpaPokemonAudioCatalogTest {

  private static final Instant NOW = Instant.parse("2026-10-31T10:00:00Z");
  private static final String CRIES = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/";

  @Inject PokemonRepository pokemon;
  @Inject PokemonAssetReferenceRepository references;
  @Inject JpaPokemonAudioCatalog catalog;

  @AfterEach
  void clean() {
    // Borrar los Pokémon arrastra en cascada sus referencias.
    for (var id : List.of("t3-cry-a", "t3-cry-b")) pokemon.deleteById(id);
  }

  @Test
  void prefersPrimaryRecentReferencesThenLegacyMetadata() {
    pokemon.save(PokemonEntity.create("t3-cry-a", 9201, "a", 1, true, new String[0], new String[0],
        Map.of("cries", Map.of("latest", CRIES + "latest/meta-a.ogg", "legacy", CRIES + "legacy/meta-a.ogg")), NOW));
    pokemon.save(PokemonEntity.create("t3-cry-b", 9202, "b", 1, true, new String[0], new String[0],
        Map.of("cries", Map.of("latest", "https://example.com/b.ogg")), NOW));
    references.save(PokemonAssetReferenceEntity.create("t3-r1", "t3-cry-a", "CRY_LATEST", CRIES + "latest/old.ogg",
        false, NOW.plusSeconds(60)));
    references.save(PokemonAssetReferenceEntity.create("t3-r2", "t3-cry-a", "CRY_LATEST", CRIES + "latest/primary.ogg",
        true, NOW));
    references.save(PokemonAssetReferenceEntity.create("t3-r3", "t3-cry-b", "CRY_LEGACY",
        "https://example.com/untrusted.ogg", true, NOW));
    references.save(PokemonAssetReferenceEntity.create("t3-r4", "t3-cry-b", "SPRITE", CRIES + "latest/sprite.ogg",
        true, NOW));

    var audio = catalog.load();
    assertEquals(CRIES + "latest/primary.ogg", audio.cryFor("t3-cry-a", CryVersion.LATEST));
    assertEquals(CRIES + "legacy/meta-a.ogg", audio.cryFor("t3-cry-a", CryVersion.LEGACY));
    assertNull(audio.cryFor("t3-cry-b", CryVersion.LATEST));
    assertNull(audio.cryFor("t3-cry-b", CryVersion.LEGACY));
    assertEquals(List.of("t3-cry-a"), audio.pokemonIds(CryVersion.LEGACY).stream()
        .filter(id -> id.startsWith("t3-")).toList());
  }
}
