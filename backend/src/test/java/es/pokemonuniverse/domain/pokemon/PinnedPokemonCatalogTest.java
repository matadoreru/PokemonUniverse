package es.pokemonuniverse.domain.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PinnedPokemonCatalogTest {

  private static final InMemoryPokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");

  private static List<String> ids(List<Pokemon> pokemon) {
    return pokemon.stream().map(Pokemon::id).toList();
  }

  @Test
  void keepsThePinnedOrder() {
    var pinned = PinnedPokemonCatalog.of(GOLDEN, List.of("pikachu", "bulbasaur", "chikorita"));
    assertEquals(List.of("pikachu", "bulbasaur", "chikorita"), ids(pinned.all()));
    assertEquals(List.of("pikachu", "bulbasaur"), ids(pinned.forGenerations(List.of(1))));
    assertEquals(List.of(), pinned.missingIds());
  }

  @Test
  void aNewPokemonOfTheCurrentCatalogStaysOut() {
    var pinnedIds = ids(GOLDEN.all());
    var rows = new ArrayList<Pokemon>();
    var base = GOLDEN.byId("pikachu").orElseThrow();
    // Un Pokémon que llega con la sincronización del día, al principio del catálogo vigente.
    rows.add(new Pokemon("pikachu-new", 9999, base.name(), base.generation(), true, base.sprite(), base.shinySprite(),
        base.palette(), base.paletteWeights(), base.hp(), base.attack(), base.defense(), base.specialAttack(),
        base.specialDefense(), base.speed(), base.baseStatTotal(), base.heightDecimeters(), base.weightHectograms(),
        base.evolutionStage(), base.evolutionStageCount(), base.legendaryStatus(), base.color(), base.abilities(),
        base.names(), base.types()));
    rows.addAll(GOLDEN.all());
    var current = new InMemoryPokemonCatalog(rows);
    var pinned = PinnedPokemonCatalog.of(current, pinnedIds);
    assertEquals(pinnedIds, ids(pinned.all()));
    assertTrue(pinned.byId("pikachu-new").isEmpty());
    assertTrue(pinned.byDexNumber(9999).isEmpty());
  }

  @Test
  void aMissingIdIsReportedAndSkipped() {
    var pinned = PinnedPokemonCatalog.of(GOLDEN, List.of("bulbasaur", "missingno", "ivysaur"));
    assertEquals(List.of("bulbasaur", "ivysaur"), ids(pinned.all()));
    assertEquals(List.of("missingno"), pinned.missingIds());
  }

  @Test
  void lookupsOnlyFindPinnedIds() {
    var pinned = PinnedPokemonCatalog.of(GOLDEN, List.of("bulbasaur"));
    assertTrue(pinned.byId("bulbasaur").isPresent());
    assertTrue(pinned.byId("ivysaur").isEmpty());
    assertTrue(GOLDEN.byId("ivysaur").isPresent());
    assertEquals("bulbasaur", pinned.byDexNumber(1).orElseThrow().id());
    assertTrue(pinned.byDexNumber(2).isEmpty());
  }

  @Test
  void keepsTheCapabilitiesOfTheWrappedCatalog() {
    var pinned = PinnedPokemonCatalog.of(GOLDEN, List.of("bulbasaur", "ivysaur", "pikachu"));
    assertEquals(GOLDEN.levelUpMoves("bulbasaur", 2), pinned.levelUpMoves("bulbasaur", 2));
    assertFalse(pinned.levelUpMoves("bulbasaur", 2).isEmpty());
    assertTrue(pinned.levelUpMoves("venusaur", 2).isEmpty());
    assertEquals(GOLDEN.evolutionInfo("bulbasaur"), pinned.evolutionInfo("bulbasaur"));
    assertEquals(GOLDEN.pokedexEntries("pikachu"), pinned.pokedexEntries("pikachu"));
    assertTrue(pinned.pokedexEntries("venusaur").isEmpty());
    // Las aristas que salen de la lista fijada se descartan, como en InMemoryPokemonCatalog.
    assertEquals(GOLDEN.preEvolutionId("ivysaur"), pinned.preEvolutionId("ivysaur"));
    assertEquals(GOLDEN.evolutionIds("bulbasaur"), pinned.evolutionIds("bulbasaur"));
    assertTrue(pinned.evolutionIds("ivysaur").isEmpty());
  }

  @Test
  void aPlainCatalogGivesNoLearnsetsInsteadOfFailing() {
    var plain = new InMemoryPokemonCatalog(GOLDEN.all());
    PokemonCatalog onlyBase = new PokemonCatalog() {
      @Override public List<Pokemon> all() { return plain.all(); }
      @Override public java.util.Optional<Pokemon> byId(String id) { return plain.byId(id); }
      @Override public java.util.Optional<Pokemon> byDexNumber(int number) { return plain.byDexNumber(number); }
      @Override public List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms) {
        return plain.forGenerations(generations, includeForms);
      }
    };
    var pinned = PinnedPokemonCatalog.of(onlyBase, List.of("bulbasaur"));
    assertTrue(pinned.levelUpMoves("bulbasaur", 2).isEmpty());
    assertTrue(pinned.evolutionInfo("bulbasaur").isEmpty());
    assertTrue(pinned.evolutionIds("bulbasaur").isEmpty());
  }
}
