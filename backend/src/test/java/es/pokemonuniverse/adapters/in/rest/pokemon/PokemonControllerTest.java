package es.pokemonuniverse.adapters.in.rest.pokemon;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.PokemonEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonRepository;
import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.assets.ResourceCapacityException;
import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import es.pokemonuniverse.domain.game.engine.EngineException;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.json.JsonMapper;
import jakarta.inject.Singleton;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "PokemonControllerTest")
class PokemonControllerTest {

  private static final Instant NOW = Instant.parse("2026-01-01T00:00:00.123Z");
  private static final String[] IDS = {"t11-bulbasaur", "t11-ivysaur", "t11-raichu-alola", "t11-pikachu-cosplay",
      "t11-abra", "t11-meowth", "t11-aa-meowth-galar", "t11-broken", "t11-html"};
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G'};

  /** Origen falso de los sprites: el proxy no sale a la red y se cuentan las descargas. */
  @Singleton
  @Replaces(AssetSourceLoader.class)
  @Requires(property = "spec.name", value = "PokemonControllerTest")
  static class FakeLoader implements AssetSourceLoader {
    final List<String> calls = Collections.synchronizedList(new ArrayList<>());

    @Override
    public LoadedAsset fetch(String source) {
      calls.add(source);
      if (source.equals("https://sprites/t11-html.png")) return new LoadedAsset("<html>".getBytes(), "text/html");
      // El sprite de abra simula la caché sin hueco para otra descarga.
      if (source.equals("https://sprites/t11-abra.png")) throw new ResourceCapacityException();
      if (source.startsWith("https://sprites/t11-") && !source.contains("broken")) return new LoadedAsset(PNG, "image/png");
      throw new EngineException("Sprite source returned 404");
    }
  }

  @Inject @Client("/") HttpClient client;
  @Inject PokemonRepository repo;
  @Inject PokemonCatalogService service;
  @Inject FakeLoader loader;
  @Inject JsonMapper json;

  @BeforeEach
  void insert() {
    clean();
    // Números de dex altos para no chocar con un catálogo sembrado en la BD local.
    repo.save(PokemonEntity.create(IDS[0], 9001, "bulbasaur", 1, true, new String[] {"overgrow"}, new String[] {"grass", "poison"},
        Map.of("palette", List.of("#112233"), "shinySprite", "https://x/shiny.png"), NOW));
    repo.save(PokemonEntity.create(IDS[1], 9002, "ivysaur", 1, true, new String[] {}, new String[] {"grass"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[2], 9003, "raichu-alola", 7, false, new String[] {"surge-surfer"}, new String[] {"electric"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[3], 9004, "pikachu-cosplay", 6, false, new String[] {"static"}, new String[] {"electric"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[4], 9063, "abra", 1, true, new String[] {}, new String[] {"psychic"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[5], 9052, "t11 meowth", 1, true, new String[] {}, new String[] {"normal"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[6], 9052, "t11 meowth", 8, false, new String[] {}, new String[] {"steel"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[7], 9099, "zz-broken", 9, true, new String[] {}, new String[] {"normal"}, null, NOW));
    repo.save(PokemonEntity.create(IDS[8], 9098, "zz-html", 9, true, new String[] {}, new String[] {"normal"}, null, NOW));
    service.refresh();
    loader.calls.clear();
  }

  @AfterEach
  void clean() {
    for (var id : IDS) repo.deleteById(id);
    service.refresh();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> selector(String qs) {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/pokemon/selector" + qs), Map.class);
    var all = (List<Map<String, Object>>) body.get("pokemon");
    return all.stream().filter(p -> ((String) p.get("id")).startsWith("t11-")).toList();
  }

  private static List<String> ids(List<Map<String, Object>> list) {
    return list.stream().map(p -> (String) p.get("id")).toList();
  }

  private HttpResponse<byte[]> exchange(HttpRequest<?> request) {
    try {
      return client.toBlocking().exchange(request, byte[].class);
    } catch (HttpClientResponseException e) {
      @SuppressWarnings("unchecked")
      var response = (HttpResponse<byte[]>) e.getResponse();
      return response;
    }
  }

  @Test
  void selectorReturnsOnlyIdNameAndOpaqueSprite() {
    var list = selector("?includeForms=true");
    assertFalse(list.isEmpty());
    for (var entry : list) {
      assertEquals(Set.of("id", "name", "sprite"), entry.keySet(), entry.toString());
      assertTrue(((String) entry.get("sprite")).matches("^/api/pokemon/[^/]+/sprite$"), entry.toString());
    }
    assertEquals("/api/pokemon/t11-bulbasaur/sprite",
        list.stream().filter(p -> p.get("id").equals(IDS[0])).findFirst().orElseThrow().get("sprite"));
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/pokemon/selector?includeForms=true"), String.class);
    for (var leak : List.of("nationalDexNumber", "generation", "types", "hp", "shinySprite", "abilities",
        "sprites/pokemon/", "isDefault", "palette", "https://")) {
      assertFalse(body.contains(leak), leak);
    }
  }

  @Test
  void selectorIsNotOrderedByDexNumber() {
    assertEquals(List.of("t11-abra", "t11-bulbasaur", "t11-ivysaur", "t11-meowth"), ids(selector("?generations=1")));
  }

  @Test
  void selectorPutsTheDefaultFormFirstAmongEqualNames() {
    var list = ids(selector("?includeForms=true"));
    assertTrue(list.indexOf("t11-meowth") >= 0 && list.indexOf("t11-meowth") < list.indexOf("t11-aa-meowth-galar"),
        list.toString());
  }

  @Test
  void selectorFiltersGenerationsAndForms() {
    assertEquals(List.of("t11-abra", "t11-bulbasaur", "t11-ivysaur", "t11-meowth", "t11-broken", "t11-html"),
        ids(selector("")));
    assertEquals(List.of("t11-abra", "t11-bulbasaur", "t11-ivysaur", "t11-raichu-alola", "t11-meowth",
        "t11-aa-meowth-galar", "t11-broken", "t11-html"), ids(selector("?includeForms=true")));
    assertEquals(List.of("t11-raichu-alola"), ids(selector("?generations=7&includeForms=true")));
    assertEquals(List.of(), ids(selector("?generations=7")));
    assertEquals(ids(selector("?generations=1")), ids(selector("?generations=1,x,12")));
    assertFalse(ids(selector("?includeForms=true")).contains("t11-pikachu-cosplay"));
  }

  @Test
  void selectorAnswers304ForAMatchingETag() throws IOException {
    var first = exchange(HttpRequest.GET("/api/pokemon/selector?generations=1"));
    assertEquals(HttpStatus.OK, first.status());
    var etag = first.header("ETag");
    assertNotNull(etag);
    assertTrue(etag.matches("^W/\"[0-9a-f]{16}\"$"), etag);
    assertEquals("no-cache", first.header("Cache-Control"));
    assertTrue(first.header("Content-Type").startsWith("application/json"), first.header("Content-Type"));
    var parsed = json.readValue(first.body(), Map.class);
    assertTrue(parsed.containsKey("pokemon"));

    var again = exchange(HttpRequest.GET("/api/pokemon/selector?generations=1").header("If-None-Match", etag));
    assertEquals(HttpStatus.NOT_MODIFIED, again.status());
    assertEquals(etag, again.header("ETag"));
    assertEquals("no-cache", again.header("Cache-Control"));
    assertTrue(again.getBody(byte[].class).map(b -> b.length == 0).orElse(true));

    var strong = etag.substring(2);
    var listed = exchange(HttpRequest.GET("/api/pokemon/selector?generations=1").header("If-None-Match", "\"x\", " + strong));
    assertEquals(HttpStatus.NOT_MODIFIED, listed.status());

    var other = exchange(HttpRequest.GET("/api/pokemon/selector?generations=1,7&includeForms=true")
        .header("If-None-Match", etag));
    assertEquals(HttpStatus.OK, other.status());
    assertFalse(etag.equals(other.header("ETag")));
  }

  @Test
  void selectorETagChangesWhenTheCatalogChanges() {
    var before = exchange(HttpRequest.GET("/api/pokemon/selector?generations=1")).header("ETag");
    repo.update(PokemonEntity.create(IDS[1], 9002, "ivysaur-renamed", 1, true, new String[] {}, new String[] {"grass"},
        null, NOW));
    service.refresh();
    var after = exchange(HttpRequest.GET("/api/pokemon/selector?generations=1").header("If-None-Match", before));
    assertEquals(HttpStatus.OK, after.status());
    assertFalse(before.equals(after.header("ETag")));
  }

  @Test
  void spriteServesTheImageAndCachesIt() {
    var first = exchange(HttpRequest.GET("/api/pokemon/t11-bulbasaur/sprite"));
    assertEquals(HttpStatus.OK, first.status());
    assertEquals("image/png", first.header("Content-Type"));
    assertEquals("public, max-age=86400", first.header("Cache-Control"));
    assertArrayEquals(PNG, first.body());
    var second = exchange(HttpRequest.GET("/api/pokemon/t11-bulbasaur/sprite"));
    assertEquals(HttpStatus.OK, second.status());
    assertEquals(List.of("https://sprites/t11-bulbasaur.png"), loader.calls);

    var unknown = exchange(HttpRequest.GET("/api/pokemon/t11-missingno/sprite"));
    assertEquals(HttpStatus.NOT_FOUND, unknown.status());
    var filteredForm = exchange(HttpRequest.GET("/api/pokemon/t11-pikachu-cosplay/sprite"));
    assertEquals(HttpStatus.NOT_FOUND, filteredForm.status());
    assertEquals(List.of("https://sprites/t11-bulbasaur.png"), loader.calls);
  }

  @Test
  void spriteSourceFailureIsA500WithoutTheSource() {
    var broken = exchange(HttpRequest.GET("/api/pokemon/t11-broken/sprite"));
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, broken.status());
    assertFalse(new String(broken.getBody(byte[].class).orElse(new byte[0])).contains("https://"));
  }

  @Test
  void capacityExhaustionIs503() {
    var busy = exchange(HttpRequest.GET("/api/pokemon/t11-abra/sprite"));
    assertEquals(HttpStatus.SERVICE_UNAVAILABLE, busy.status());
    assertEquals("{\"error\":\"El servidor está procesando demasiados recursos. Reintenta en unos segundos.\"}",
        new String(busy.getBody(byte[].class).orElse(new byte[0]), java.nio.charset.StandardCharsets.UTF_8));
  }

  /** Si el origen no devuelve una imagen, el proxy no la reenvía como si lo fuera. */
  @Test
  void spriteRejectsANonImageUpstreamWith502() {
    var html = exchange(HttpRequest.GET("/api/pokemon/t11-html/sprite"));
    assertEquals(HttpStatus.BAD_GATEWAY, html.status());
    assertFalse(new String(html.getBody(byte[].class).orElse(new byte[0])).contains("<html>"));
  }

  @Test
  void legacyCatalogRouteIsGone() {
    assertEquals(HttpStatus.NOT_FOUND, exchange(HttpRequest.GET("/api/pokemon")).status());
    assertEquals(HttpStatus.NOT_FOUND, exchange(HttpRequest.GET("/api/pokemon?generations=1")).status());
  }

  /** Una paleta persistida válida llega al catálogo de las partidas, pero no al buscador. */
  @Test
  void keepsAValidPaletteInTheCatalogButNotInTheResponse() {
    var metadata = Map.<String, Object>of("palette", List.of("#112233", "#445566", "#778899"),
        "paletteWeights", List.of(3, 2, 1), "paletteVersion", 3,
        "paletteSpriteUrl", "https://sprites/" + IDS[1] + ".png");
    repo.update(PokemonEntity.create(IDS[1], 9002, "ivysaur", 1, true, new String[] {}, new String[] {"grass"}, metadata,
        NOW));
    service.refresh();
    var ivysaur = service.catalog().byId(IDS[1]).orElseThrow();
    assertEquals(List.of("#112233", "#445566", "#778899"), ivysaur.palette());
    assertEquals(List.of(3.0, 2.0, 1.0), ivysaur.paletteWeights());
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/pokemon/selector"), String.class);
    assertTrue(body.contains("\"" + IDS[1] + "\""), body);
    assertFalse(body.contains("palette"), body);
  }
}
