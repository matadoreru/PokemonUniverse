package es.pokemonuniverse.domain.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class InMemoryPokemonCatalogTest {

  private static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");

  private static Pokemon pokemon(String id, int dex, boolean isDefault) {
    return new Pokemon(id, dex, id, 1, isDefault, "s", null, null, null, 1, 1, 1, 1, 1, 1, 6, 1, 1, null, null, "NORMAL",
        "red", List.of(), Map.of(), List.of("normal"));
  }

  @Test
  void loadsTheFixtureRows() {
    assertEquals(293, CATALOG.all().size());
    var bulbasaur = CATALOG.byId("bulbasaur").orElseThrow();
    assertEquals("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/1.png", bulbasaur.shinySprite());
    assertEquals(List.of("grass", "poison"), bulbasaur.types());
    assertEquals(3, bulbasaur.evolutionStageCount());
  }

  @Test
  void defaultsOfOneGenerationAreOrderedByDexNumber() {
    var gen1 = CATALOG.forGenerations(List.of(1), false);
    assertEquals(151, gen1.size());
    assertEquals(IntStream.rangeClosed(1, 151).boxed().toList(), gen1.stream().map(Pokemon::nationalDexNumber).toList());
    assertTrue(gen1.stream().allMatch(Pokemon::isDefault));
    assertEquals(gen1, CATALOG.forGenerations(List.of(1)));
  }

  @Test
  void includeFormsAddsOnlySupportedRegionalForms() {
    var gen1 = CATALOG.forGenerations(List.of(1), true);
    assertTrue(gen1.stream().anyMatch(p -> p.id().equals("vulpix-alola")));
    assertTrue(gen1.stream().filter(p -> !p.isDefault()).allMatch(p -> RegionalForms.isSupported(p.id())));
    assertTrue(gen1.size() > 151);
    assertEquals(CATALOG.all().size(), CATALOG.forGenerations(List.of(1, 2), true).size());
    assertEquals(100, CATALOG.forGenerations(List.of(2), false).size());
    assertEquals(List.of(), CATALOG.forGenerations(List.of(3), true));
  }

  @Test
  void looksUpByIdAndDexNumber() {
    assertEquals("pikachu", CATALOG.byDexNumber(25).orElseThrow().id());
    assertTrue(CATALOG.byId("raichu-alola").isPresent());
    assertEquals("raichu", CATALOG.byDexNumber(26).orElseThrow().id());
    assertFalse(CATALOG.byDexNumber(252).isPresent());
    assertFalse(CATALOG.byId("missingno").isPresent());
  }

  @Test
  void keepsTheFirstDefaultPerDexNumberAndOnlySupportedForms() {
    var catalog = new InMemoryPokemonCatalog(List.of(pokemon("a", 1, true), pokemon("a-dup", 1, true),
        pokemon("a-alola", 1, false), pokemon("a-totem-alola", 1, false), pokemon("a-cosplay", 1, false)));
    assertEquals(List.of("a", "a-alola"), catalog.all().stream().map(Pokemon::id).toList());
    assertEquals("a", catalog.byDexNumber(1).orElseThrow().id());
    assertFalse(catalog.byId("a-dup").isPresent());
    assertNull(catalog.byId("a").orElseThrow().shinySprite());
  }

  private static Move move(String id, String name) {
    return new Move(id, name, "normal", "physical", null);
  }

  private static PokedexEntry entry(String pokemonId, int generation, String version) {
    return new PokedexEntry(pokemonId, "texto " + version, "es", generation, version, version.toUpperCase());
  }

  private static InMemoryPokemonCatalog withLearnsets(List<LearnsetEntry> learnsets) {
    return new InMemoryPokemonCatalog(List.of(pokemon("a", 1, true)),
        List.of(move("tackle", "Placaje"), move("acid", "Ácido"), move("growl", "gruñido"), move("ember", "Ñ"),
            move("wave", "Onda")),
        learnsets, Map.of("a", new PokemonEvolutionInfo(1, 2)), List.of());
  }

  @Test
  void learnsetsOfOneLevelAreOrderedByMoveNameWithCollations() {
    var catalog = withLearnsets(List.of(new LearnsetEntry("a", "wave", 1, 5), new LearnsetEntry("a", "tackle", 1, 1),
        new LearnsetEntry("a", "ember", 1, 5), new LearnsetEntry("a", "growl", 1, 1), new LearnsetEntry("a", "acid", 1, 1)));
    var moves = catalog.levelUpMoves("a", 1);
    assertEquals(List.of("Ácido", "gruñido", "Placaje", "Ñ", "Onda"), moves.stream().map(m -> m.move().name()).toList());
    assertEquals(List.of(1, 1, 1, 5, 5), moves.stream().map(ResolvedLevelUpMove::level).toList());
    assertEquals("acid", moves.get(0).moveId());
    assertEquals(List.of(), catalog.levelUpMoves("a", 2));
    assertEquals(List.of(), catalog.levelUpMoves("missing", 1));
  }

  @Test
  void learnsetsOfAnUnknownMoveAreDropped() {
    var catalog = withLearnsets(List.of(new LearnsetEntry("a", "tackle", 1, 1), new LearnsetEntry("a", "hyper-beam", 1, 1),
        new LearnsetEntry("b", "hyper-beam", 2, 3)));
    assertEquals(List.of("tackle"), catalog.levelUpMoves("a", 1).stream().map(ResolvedLevelUpMove::moveId).toList());
    assertEquals(List.of(), catalog.levelUpMoves("b", 2));
  }

  @Test
  void evolutionInfoIsLookedUpById() {
    var catalog = withLearnsets(List.of());
    assertEquals(Optional.of(new PokemonEvolutionInfo(1, 2)), catalog.evolutionInfo("a"));
    assertEquals(Optional.empty(), catalog.evolutionInfo("missing"));
  }

  @Test
  void pokedexEntriesKeepArrivalOrderWhenAlreadySortedLikeTheLoader() {
    var entries = List.of(entry("a", 2, "crystal"), entry("a", 2, "gold"), entry("a", 1, "red"), entry("b", 1, "blue"));
    var catalog = new InMemoryPokemonCatalog(List.of(pokemon("a", 1, true)), List.of(), List.of(), Map.of(), entries);
    assertEquals(entries.subList(0, 3), catalog.pokedexEntries("a"));
    assertEquals(List.of(entries.get(3)), catalog.pokedexEntries("b"));
    assertEquals(List.of(), catalog.pokedexEntries("missing"));
  }

  @Test
  void pokedexEntriesAreSortedNewestGenerationFirstThenVersionLikeNode() {
    // El constructor de Node reordena cada lista: generación descendente y después versión con localeCompare.
    var catalog = new InMemoryPokemonCatalog(List.of(pokemon("a", 1, true)), List.of(), List.of(), Map.of(),
        List.of(entry("a", 1, "yellow"), entry("a", 2, "silver"), entry("a", 1, "Blue"), entry("a", 2, "crystal")));
    assertEquals(List.of("crystal", "silver", "Blue", "yellow"),
        catalog.pokedexEntries("a").stream().map(PokedexEntry::version).toList());
  }

  @Test
  void evolutionLinksAreIndexedBothWaysAndDropUnknownPokemon() {
    var catalog = new InMemoryPokemonCatalog(List.of(pokemon("a", 1, true), pokemon("b", 2, true),
        pokemon("c", 3, true)), List.of(), List.of(), Map.of(), List.of(),
        List.of(new PokemonEvolutionLink("a", "b"), new PokemonEvolutionLink("a", "c"),
            new PokemonEvolutionLink("c", "missing"), new PokemonEvolutionLink("ghost", "b")));
    assertEquals(Optional.of("a"), catalog.preEvolutionId("b"));
    assertEquals(Optional.empty(), catalog.preEvolutionId("a"));
    assertEquals(List.of("b", "c"), catalog.evolutionIds("a"));
    assertEquals(List.of(), catalog.evolutionIds("c"));
  }

  @Test
  void implementsBothExtendedCatalogInterfaces() {
    PokemonCatalog plain = new InMemoryPokemonCatalog(List.of(pokemon("a", 1, true)));
    assertTrue(plain instanceof LearnsetPokemonCatalog);
    assertTrue(plain instanceof PokedexEntryPokemonCatalog);
    assertTrue(plain instanceof EvolutionPokemonCatalog);
    assertEquals(List.of(), ((EvolutionPokemonCatalog) plain).evolutionIds("a"));
    assertEquals(List.of(), ((LearnsetPokemonCatalog) plain).levelUpMoves("a", 1));
    assertEquals(Optional.empty(), ((LearnsetPokemonCatalog) plain).evolutionInfo("a"));
  }

  @Test
  void theFixtureCarriesLearnsetsEvolutionAndPokedexEntries() {
    assertEquals(Optional.of(new PokemonEvolutionInfo(1, 3)), CATALOG.evolutionInfo("bulbasaur"));
    var bulbasaur = CATALOG.levelUpMoves("bulbasaur", 1);
    assertFalse(bulbasaur.isEmpty());
    assertTrue(bulbasaur.stream().allMatch(m -> m.moveId().equals(m.move().id())));
    assertFalse(CATALOG.levelUpMoves("chikorita", 2).isEmpty());
    assertTrue(CATALOG.levelUpMoves("bulbasaur", 3).isEmpty());
    var entries = CATALOG.pokedexEntries("bulbasaur");
    assertFalse(entries.isEmpty());
    assertTrue(entries.stream().allMatch(e -> e.language().equals("es")));
  }

  @Test
  void fixtureLearnsetsKeepTheOrderNodeExportedThemIn() {
    // El exportador escribe cada lista tal como la ordenó Node (nivel y localeCompare): Collations debe coincidir.
    var exported = GoldenCatalogs.learnsets("gen1-2");
    var resolved = CATALOG.all().stream()
        .flatMap(p -> List.of(1, 2).stream().flatMap(gen -> CATALOG.levelUpMoves(p.id(), gen).stream()
            .map(m -> new LearnsetEntry(p.id(), m.moveId(), gen, m.level()))))
        .toList();
    assertEquals(3322, exported.size());
    assertEquals(exported, resolved);
  }

  @Test
  void fixturePokedexEntriesKeepTheOrderNodeExportedThemIn() {
    var exported = GoldenCatalogs.pokedexEntries("gen1-2");
    var resolved = CATALOG.all().stream().flatMap(p -> CATALOG.pokedexEntries(p.id()).stream()).toList();
    assertFalse(exported.isEmpty());
    assertEquals(exported, resolved);
  }

  @Test
  void generationLearnsetSourcesMatchTheSharedConstant() {
    assertEquals("yellow", GenerationLearnsetSources.versionGroup(1));
    assertEquals("Pokémon Crystal", GenerationLearnsetSources.label(2));
    assertEquals("scarlet-violet", GenerationLearnsetSources.versionGroup(9));
    assertEquals("Pokémon HeartGold / SoulSilver", GenerationLearnsetSources.label(4));
  }
}
