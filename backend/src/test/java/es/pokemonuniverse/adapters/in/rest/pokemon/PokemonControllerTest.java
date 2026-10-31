package es.pokemonuniverse.adapters.in.rest.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.PokemonEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonRepository;
import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class PokemonControllerTest {

  private static final Instant NOW = Instant.parse("2026-01-01T00:00:00.123Z");
  private static final String[] IDS = {"t11-bulbasaur", "t11-ivysaur", "t11-raichu-alola", "t11-pikachu-cosplay"};

  @Inject @Client("/") HttpClient client;
  @Inject PokemonRepository repo;
  @Inject PokemonCatalogService service;

  @BeforeEach
  void insert() {
    clean();
    // Números de dex altos para no chocar con un catálogo sembrado en la BD local.
    repo.save(PokemonEntity.create(IDS[0], 9001, "bulbasaur", 1, true, new String[] {"overgrow"}, new String[] {"grass", "poison"},
        Map.of("palette", List.of("#112233"), "shinySprite", "https://x/shiny.png"), NOW));
    repo.save(PokemonEntity.create(IDS[1], 9002, "ivysaur", 1, true, new String[] {}, new String[] {"grass"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[2], 9003, "raichu-alola", 7, false, new String[] {"surge-surfer"}, new String[] {"electric"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[3], 9004, "pikachu-cosplay", 6, false, new String[] {"static"}, new String[] {"electric"}, null, NOW));
    service.refresh();
  }

  @AfterEach
  void clean() {
    for (var id : IDS) repo.deleteById(id);
    service.refresh();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> get(String qs) {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/pokemon" + qs), Map.class);
    var all = (List<Map<String, Object>>) body.get("pokemon");
    return all.stream().filter(p -> ((String) p.get("id")).startsWith("t11-")).toList();
  }

  private static List<String> ids(List<Map<String, Object>> list) {
    return list.stream().map(p -> (String) p.get("id")).toList();
  }

  @Test
  void listsDefaultsOnly() {
    assertEquals(List.of("t11-bulbasaur", "t11-ivysaur"), ids(get("")));
  }

  @Test
  void includeFormsAddsSupportedForms() {
    assertEquals(List.of("t11-bulbasaur", "t11-ivysaur", "t11-raichu-alola"), ids(get("?includeForms=true")));
  }

  @Test
  void filtersByGenerations() {
    assertEquals(List.of("t11-bulbasaur", "t11-ivysaur"), ids(get("?generations=1&includeForms=true")));
    assertEquals(List.of("t11-raichu-alola"), ids(get("?generations=7&includeForms=true")));
  }

  @Test
  void ignoresInvalidGenerationTokens() {
    assertEquals(ids(get("?generations=1")), ids(get("?generations=1,x,12")));
    assertEquals(List.of("t11-bulbasaur", "t11-ivysaur"), ids(get("?generations=1,x,12")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void omitsPaletteAndKeepsKeys() {
    var list = get("");
    var bulbasaur = list.get(0);
    assertFalse(bulbasaur.containsKey("palette"));
    assertFalse(bulbasaur.containsKey("paletteWeights"));
    assertEquals("https://x/shiny.png", bulbasaur.get("shinySprite"));
    assertEquals(7, bulbasaur.get("heightDecimeters"));
    assertEquals(List.of("grass", "poison"), bulbasaur.get("types"));
    assertEquals(List.of("overgrow"), bulbasaur.get("abilities"));
    assertEquals(true, bulbasaur.get("isDefault"));
    var ivysaur = list.get(1);
    assertTrue(ivysaur.get("abilities") instanceof List<?> l && l.isEmpty());
    assertFalse(ivysaur.containsKey("shinySprite"));
    assertFalse(ivysaur.containsKey("names"));
    assertFalse(ivysaur.containsKey("evolutionStage"));
  }

  @Test
  void setsCacheHeader() {
    var res = client.toBlocking().exchange(HttpRequest.GET("/api/pokemon"), String.class);
    assertEquals("public, max-age=3600, stale-while-revalidate=86400", res.header("Cache-Control"));
  }
}
