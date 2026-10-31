package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog.CryVersion;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Los mismos casos que {@code buildGoldenContext} en {@code runner.test.ts}. */
class GoldenContextsTest {

  private static GameContext context(String extra) throws IOException {
    var json = "{\"engineId\":\"fake\",\"scenario\":\"s\",\"seed\":1,\"catalog\":\"gen1-2\","
        + "\"players\":[{\"id\":\"p1\",\"displayName\":\"A\"},{\"id\":\"p2\",\"displayName\":\"B\"}],\"config\":{}"
        + extra + ",\"steps\":[],\"expected\":{\"configNormalized\":{},\"initial\":{\"finished\":false},"
        + "\"afterStart\":{\"finished\":false},\"afterSteps\":[]}}";
    var fixture = ObjectMapper.getDefault().readValue(json, GoldenFixture.class);
    return GoldenContexts.contextFor(fixture, new InMemoryPokemonCatalog(List.of()), new Mulberry32(1));
  }

  @Test
  void audioComesFromTheFixture() throws IOException {
    var audio = context(",\"pokemonAudio\":{\"bulbasaur\":{\"latest\":\"https://raw.githubusercontent.com/PokeAPI/cries/x.ogg\"}}")
        .pokemonAudio();
    assertEquals("https://raw.githubusercontent.com/PokeAPI/cries/x.ogg", audio.cryFor("bulbasaur", CryVersion.LATEST));
    assertNull(audio.cryFor("bulbasaur", CryVersion.LEGACY));
    assertEquals(List.of(), audio.pokemonIds(CryVersion.LEGACY));
    assertEquals(List.of("bulbasaur"), audio.pokemonIds(null));
  }

  @Test
  void onlyTheCatalogsTheFixtureCarriesArePresent() throws IOException {
    var context = context("");
    assertNull(context.pokemonAudio());
    assertNull(context.pokemonVisuals());
    assertNull(context.tcgCards());
    assertEquals(List.of(), context.hostCustomCategories());
    assertEquals(List.of(), context.hostWouldYouRatherPrompts());
    assertNotNull(context.preloadImage());
    assertEquals("p1", context.hostId());
    assertEquals("GOLD01", context.roomCode());
    assertEquals(1000L, context.now());
  }

  @Test
  void visualsAndHostContent() throws IOException {
    var context = context(",\"hostCustomCategories\":[{\"id\":\"c1\",\"text\":\"Quién\"}],"
        + "\"hostWouldYouRatherPrompts\":[{\"id\":\"w1\",\"optionA\":\"A\",\"optionB\":\"B\"}],"
        + "\"pokemonVisuals\":{\"pikachu\":{\"pokemonId\":\"pikachu\",\"source\":\"ARTWORK\","
        + "\"location\":\"local-artwork:pikachu\",\"width\":10,\"height\":10}}");
    assertEquals(new PokemonVisualCatalog.Asset("pikachu", PokemonVisualCatalog.Source.ARTWORK, "local-artwork:pikachu",
        10, 10, null), context.pokemonVisuals().artworkFor("pikachu"));
    assertNull(context.pokemonVisuals().artworkFor("mew"));
    assertEquals(List.of("pikachu"), context.pokemonVisuals().artworkPokemonIds());
    assertEquals(List.of(new SubjectiveCategory("c1", "Quién")), context.hostCustomCategories());
    assertEquals(List.of(new WouldYouRatherPromptPair("w1", "A", "B")), context.hostWouldYouRatherPrompts());
  }

  private static String card(String id, String setId, String rarity, String price) {
    return "{\"id\":\"" + id + "\",\"name\":\"" + id + "\",\"localId\":\"1\",\"setId\":\"" + setId + "\",\"setName\":\""
        + setId + "\",\"rarity\":" + (rarity == null ? "null" : "\"" + rarity + "\"") + ",\"imageUrl\":\"https://example.test/"
        + id + ".png\",\"price\":\"" + price + "\",\"currency\":\"EUR\",\"provider\":\"cardmarket\",\"variant\":\"standard\"}";
  }

  @Test
  void tcgCardsFilterBySetRarityAndDecimalPrice() throws IOException {
    var tcg = context(",\"tcgCards\":[" + card("a", "s1", "Rare", "1.001") + "," + card("b", "s1", "Common", "1.002") + ","
        + card("c", "s2", "Rare", "10") + "," + card("d", "s2", null, "0") + "]").tcgCards();
    assertEquals(List.of("a", "b", "c", "d"), ids(tcg, List.of(), List.of(), null, null));
    assertEquals(List.of("c", "d"), ids(tcg, List.of("s2"), List.of(), null, null));
    assertEquals(List.of("a", "c"), ids(tcg, List.of(), List.of("Rare"), null, null));
    assertEquals(List.of("b"), ids(tcg, List.of(), List.of(), "1.002", "9.99"));
  }

  private static List<String> ids(TcgCardCatalog tcg, List<String> setIds, List<String> rarities, String min, String max) {
    return tcg.cardsFor(new TcgCardCatalog.Filters(List.of(1), setIds, rarities, min, max)).stream()
        .map(TcgCardCatalog.Card::id).toList();
  }
}
