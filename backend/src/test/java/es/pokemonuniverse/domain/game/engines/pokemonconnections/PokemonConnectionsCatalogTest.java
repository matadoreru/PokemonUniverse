package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CategoryDefinition;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CuratedTemplate;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.PuzzleOptions;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.ConnectionAnswerGroup;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * El catálogo curado conserva los ids y el orden que se exportaron una vez de {@code connectionCategoryCatalog} del
 * dist de shared ({@code npx tsx -e}); el orden alimenta {@code shuffled}, así que un cambio aquí rompe las fixtures.
 * Las categorías dinámicas ya divergen a propósito del TS: sin colores, con monotipos, dobles tipos, habilidades,
 * iniciales del nombre y altura mínima, y con familias para que un tablero no repita la misma idea.
 */
class PokemonConnectionsCatalogTest {

  private static final String[] CATEGORY_IDS = {
    "eevee-family", "fossils", "dogs", "food", "cats", "bears", "baby", "pseudo-final", "electric-rodents",
    "artificial-objects", "grass-partners", "fire-partners", "water-partners", "regional-birds", "trade-evolution",
    "branch-evolution", "friendship-evolution", "stone-evolution", "turtles", "snakes", "monkeys", "horses",
    "crustaceans", "frogs", "rabbits", "foxes", "bats", "penguins", "owls", "pigs", "elephants", "sharks", "mushrooms",
    "flowers", "musical", "pokeball-lookalikes", "multiple-heads", "ancient-future-paradox", "ultra-beasts",
    "regi-family", "rodents", "spiders", "butterflies-moths", "fish", "sheep-goats", "ducks", "legendary-birds",
    "legendary-beasts", "weather-trio", "lake-guardians", "creation-trio", "swords-of-justice", "forces-of-nature",
    "tapu-guardians", "treasures-of-ruin", "loyal-three-and-master", "mythical-balanced-stats", "movie-stars",
    "ash-team", "misty-team", "brock-team", "team-rocket", "champion-aces", "box-art", "final-starters",
    "regional-forms", "kalos-hoenn-megas", "gigantamax", "fusions", "ability-forms", "move-evolution", "cocoons",
    "human-made", "space", "japanese-folklore", "object-ghosts", "dinosaurs", "lizards", "crocodiles", "beetles",
    "bees", "snails-slugs", "deer", "fruits-vegetables", "royalty", "female-only", "male-only",
    "kanto-gym-aces", "johto-gym-aces", "hoenn-gym-aces", "sinnoh-gym-aces", "unova-gym-aces", "kalos-gym-aces",
    "galar-gym-aces", "paldea-gym-aces", "villain-aces", "ash-kanto-team", "trade-item-evolution",
    "name-hides-number", "mustaches", "headwear", "leaf-heads", "held-objects",
    "single-horn", "one-eye", "fire-tails", "own-light", "route-one-normals", "early-forest-bugs", "pseudo-first",
    "disguises", "plant-lookalikes", "trees", "rocks-with-face", "dolls", "warriors", "martial-artists", "dancers",
    "sleep-dreams", "gluttons", "slimy", "pollution", "whales-dolphins", "giants",
  };

  /** Las categorías curiosas nuevas: cada una con lista explícita de al menos 6 miembros. */
  private static final List<String> NEW_CURATED_IDS = List.of(
    "kanto-gym-aces", "johto-gym-aces", "hoenn-gym-aces", "sinnoh-gym-aces", "unova-gym-aces", "kalos-gym-aces",
    "galar-gym-aces", "paldea-gym-aces", "villain-aces", "ash-kanto-team", "trade-item-evolution",
    "name-hides-number", "mustaches", "headwear", "leaf-heads", "held-objects",
    "single-horn", "one-eye", "fire-tails", "own-light", "route-one-normals", "early-forest-bugs", "pseudo-first",
    "disguises", "plant-lookalikes", "trees", "rocks-with-face", "dolls", "warriors", "martial-artists", "dancers",
    "sleep-dreams", "gluttons", "slimy", "pollution", "whales-dolphins");

  private static final String[] TEMPLATE_IDS = {
    "classic-connections", "companions-connections", "first-partners-connections", "evolution-methods-connections",
    "animal-shapes-connections", "nature-connections", "legendary-groups-connections", "wildlife-connections",
  };

  @Test
  void categoriesKeepTheTsCountAndOrder() {
    var catalog = PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG;
    assertEquals(124, catalog.size());
    assertArrayEquals(CATEGORY_IDS, catalog.stream().map(CategoryDefinition::id).toArray(String[]::new));
  }

  @Test
  void newCuratedCategoriesHaveAtLeastSixDistinctMembers() {
    assertTrue(NEW_CURATED_IDS.size() >= 36);
    var byId = new java.util.HashMap<String, CategoryDefinition>();
    for (var definition : PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG) byId.put(definition.id(), definition);
    for (var id : NEW_CURATED_IDS) {
      var definition = byId.get(id);
      assertNotNull(definition, id);
      assertNotNull(definition.pokemonIds(), id);
      assertNull(definition.matches(), id);
      assertTrue(definition.pokemonIds().size() >= 6, id);
      assertEquals(definition.pokemonIds().size(), new HashSet<>(definition.pokemonIds()).size(), id);
      // Evolucionar por intercambio con objeto es un dato oficial que no se ve: cuenta como de datos.
      assertEquals(id.equals("trade-item-evolution"), PokemonConnectionsCatalog.isDataCategory(id), id);
    }
  }

  /** Los umbrales que nadie sabe de memoria ya no son categorías. */
  @Test
  void obscureThresholdCategoriesAreGone() {
    var ids = new HashSet<String>();
    for (var definition : PokemonConnectionsCatalog.resolvedCategoryDefinitions(gen12Pool())) ids.add(definition.id());
    for (var id : List.of("same-defenses", "bst-600-plus", "speed-100-plus", "heavyweights", "featherweights")) {
      assertFalse(ids.contains(id), id);
    }
  }

  @Test
  void dataCategoriesAreMarked() {
    for (var id : List.of("type-fire", "mono-water", "dual-grass-poison", "single-type", "dual-type", "ability-espesura",
        "ability-mar-llamas", "ability-torrente", "ability-levitacion", "letter-p", "generation-1", "evolution-first",
        "evolution-final", "single-stage", "legendary", "mythical", "ordinary", "giants", "tiny", "female-only",
        "male-only", "baby", "stone-evolution", "friendship-evolution", "move-evolution", "trade-evolution",
        "trade-item-evolution")) {
      assertTrue(PokemonConnectionsCatalog.isDataCategory(id), id);
    }
    for (var id : List.of("eevee-family", "grass-partners", "dogs", "branch-evolution", "kanto-gym-aces",
        "ability-forms")) {
      assertFalse(PokemonConnectionsCatalog.isDataCategory(id), id);
    }
  }

  /** Treinta tableros seguidos con semilla fija: como mucho una categoría de datos en cada uno. */
  @Test
  void atMostOneDataCategoryPerBoard() {
    for (var generations : List.of(List.of(1), List.of(1, 2))) {
      var context = GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(7))
          .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).build();
      var used = new ArrayList<String>();
      for (int round = 0; round < 30; round++) {
        var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context,
            new PuzzleOptions(4, 16, generations, List.copyOf(used), List.of()));
        long data = puzzle.groups().stream()
            .filter(group -> PokemonConnectionsCatalog.isDataCategory(group.categoryId())).count();
        assertTrue(data <= 1, puzzle.key());
        puzzle.groups().forEach(group -> assertFalse(group.categoryId().equals("same-defenses"), puzzle.key()));
        used.add(puzzle.key());
      }
    }
  }

  /**
   * Un pool sin curadas que lleguen a un grupo (como una generación suelta con el tablero grande): el último recurso
   * admite más de una categoría de datos antes de rendirse.
   */
  @Test
  void poolsWithoutCuratedGroupsStillBuildABoard() {
    var curated = new HashSet<String>();
    for (var definition : PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG) {
      if (definition.pokemonIds() != null && !PokemonConnectionsCatalog.isDataCategory(definition.id())) {
        curated.addAll(definition.pokemonIds());
      }
    }
    var rows = GoldenCatalogs.load("gen1-2").forGenerations(List.of(1, 2), false).stream()
        .filter(pokemon -> !curated.contains(pokemon.id())).toList();
    var context = GameContext.builder(new InMemoryPokemonCatalog(rows), new Mulberry32(3))
        .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).build();
    var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context,
        new PuzzleOptions(4, 16, List.of(1, 2), List.of(), List.of()));
    assertEquals("DYNAMIC", puzzle.source());
    assertTrue(puzzle.groups().stream()
        .allMatch(group -> PokemonConnectionsCatalog.isDataCategory(group.categoryId())), puzzle.key());
  }

  /** La forma corporal de la Pokédex no es evidente para un jugador: no hay categorías {@code shape-*}. */
  @Test
  void noBodyShapeCategoryRemains() {
    for (var category : PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG) {
      assertFalse(category.id().startsWith("shape-"), category.id());
    }
  }

  @Test
  void firstAndLastCategoriesKeepTheirLiterals() {
    var first = PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG.getFirst();
    assertEquals("Evoluciones de Eevee", first.label());
    assertEquals("Todas son evoluciones posibles de Eevee.", first.explanation());
    assertEquals(List.of("vaporeon", "jolteon", "flareon", "espeon", "umbreon", "leafeon", "glaceon", "sylveon"),
        first.pokemonIds());
    assertNull(first.matches());
    var movies = PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG.stream()
        .filter(category -> category.id().equals("movie-stars")).findFirst().orElseThrow();
    assertEquals("Protagonistas de películas", movies.label());
    assertEquals(35, movies.pokemonIds().size());
    var last = PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG.getLast();
    assertEquals("Miden 3 metros o más", last.label());
    assertEquals("Su altura oficial alcanza al menos 3 metros.", last.explanation());
    assertNull(last.pokemonIds());
  }

  /**
   * Las fixtures doradas solo cubren las generaciones 1 y 2: este test comprueba que cada slug de las listas fijas
   * (también de generaciones posteriores) es un Pokémon por defecto con sprite del catálogo real
   * ({@code golden/catalog/default-pokemon-ids.json}, que exporta {@code npm run golden:catalog}).
   */
  @Test
  void everyListedSlugIsADefaultPokemonOfTheCatalog() throws IOException {
    String json;
    try (var stream = getClass().getResourceAsStream("/golden/catalog/default-pokemon-ids.json")) {
      assertNotNull(stream, "falta golden/catalog/default-pokemon-ids.json");
      json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
    }
    var ids = new HashSet<String>();
    var matcher = Pattern.compile("\"([^\"]+)\"").matcher(json);
    while (matcher.find()) ids.add(matcher.group(1));
    assertTrue(ids.size() > 1_000);
    var unknown = new ArrayList<String>();
    for (var category : PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG) {
      if (category.pokemonIds() == null) continue;
      for (var id : category.pokemonIds()) if (!ids.contains(id)) unknown.add(category.id() + ":" + id);
    }
    for (var template : PokemonConnectionsCatalog.CURATED_TEMPLATES) {
      for (var group : template.groups()) {
        for (var id : group.pokemonIds()) if (!ids.contains(id)) unknown.add(template.id() + ":" + id);
      }
    }
    assertEquals(List.of(), unknown);
  }

  @Test
  void curatedTemplatesKeepTheTsOrder() {
    var templates = PokemonConnectionsCatalog.CURATED_TEMPLATES;
    assertArrayEquals(TEMPLATE_IDS, templates.stream().map(CuratedTemplate::id).toArray(String[]::new));
    assertEquals(List.of("eevee-family", "fossils", "dogs", "food"),
        templates.getFirst().groups().stream().map(PokemonConnectionsCatalog.TemplateGroup::categoryId).toList());
    var lastGroup = templates.getLast().groups().getLast();
    assertEquals("ducks", lastGroup.categoryId());
    assertEquals(List.of("psyduck", "farfetchd", "ducklett", "quaxly"), lastGroup.pokemonIds());
  }

  /** Las categorías dinámicas nuevas (sin contar las que ya traía el TS), en el orden del generador. */
  private static final List<String> NEW_DYNAMIC_IDS = List.of(
      "mono-normal", "mono-fire", "mono-water", "mono-electric", "mono-grass", "mono-ice", "mono-fighting",
      "mono-poison", "mono-ground", "mono-flying", "mono-psychic", "mono-bug", "mono-rock", "mono-ghost",
      "mono-dragon", "mono-dark", "mono-steel", "mono-fairy",
      "dual-normal-flying", "dual-grass-poison", "dual-bug-flying", "dual-bug-poison", "dual-water-rock",
      "dual-ground-rock", "dual-water-ground", "dual-water-ice",
      "ability-espesura", "ability-mar-llamas", "ability-torrente", "ability-enjambre", "ability-levitacion",
      "ability-intimidacion", "ability-robustez", "ability-sincronia", "ability-nado-rapido", "ability-clorofila",
      "ability-absorbe-agua", "ability-electricidad-estatica",
      "letter-a", "letter-b", "letter-c", "letter-d", "letter-g", "letter-m", "letter-p", "letter-t",
      "tiny");

  /** Las nuevas que en gen 1–2 no llegan a 4 miembros: el generador las descarta solas. */
  private static final Set<String> SHORT_IN_GEN_1_2 = Set.of("mono-ice", "mono-flying", "mono-rock", "mono-ghost",
      "mono-dragon", "mono-dark", "mono-steel", "dual-water-ground", "dual-water-ice");

  private static List<Pokemon> gen12Pool() {
    return GoldenCatalogs.load("gen1-2").forGenerations(List.of(1, 2), false).stream()
        .filter(pokemon -> pokemon.isDefault() && pokemon.sprite() != null && !pokemon.sprite().isEmpty())
        .toList();
  }

  @Test
  void colorCategoriesAreGone() {
    var ids = PokemonConnectionsCatalog.resolvedCategoryDefinitions(gen12Pool()).stream()
        .map(CategoryDefinition::id).toList();
    assertEquals(List.of(), ids.stream().filter(id -> id.startsWith("color-")).toList());
  }

  @Test
  void addsAtLeastThirtyNewDynamicCategoriesWithEnoughMembersInGenOneAndTwo() {
    var pool = gen12Pool();
    var resolved = PokemonConnectionsCatalog.resolvedCategoryDefinitions(pool);
    var byId = new java.util.HashMap<String, CategoryDefinition>();
    for (var definition : resolved) byId.put(definition.id(), definition);
    var shortOnes = new TreeSet<String>();
    for (var id : NEW_DYNAMIC_IDS) {
      var definition = byId.get(id);
      assertNotNull(definition, id);
      assertTrue(!definition.label().isBlank() && !definition.explanation().isBlank(), id);
      if (PokemonConnectionsCatalog.membersFor(definition, pool).size() < 4) shortOnes.add(id);
    }
    assertTrue(NEW_DYNAMIC_IDS.size() - shortOnes.size() >= 30, shortOnes.toString());
    assertEquals(new TreeSet<>(SHORT_IN_GEN_1_2), shortOnes);
  }

  @Test
  void newCategoriesMatchTheVisibleData() {
    var pool = gen12Pool();
    var byId = new java.util.HashMap<String, CategoryDefinition>();
    for (var definition : PokemonConnectionsCatalog.resolvedCategoryDefinitions(pool)) {
      byId.put(definition.id(), definition);
    }
    var members = (java.util.function.Function<String, Set<String>>) id -> new HashSet<>(
        PokemonConnectionsCatalog.membersFor(byId.get(id), pool).stream().map(Pokemon::id).toList());
    assertTrue(members.apply("mono-fire").contains("charmander"));
    assertFalse(members.apply("mono-fire").contains("charizard"));
    assertTrue(members.apply("dual-normal-flying").containsAll(List.of("pidgey", "spearow", "hoothoot")));
    assertTrue(members.apply("dual-grass-poison").contains("bulbasaur"));
    assertEquals(Set.of("bulbasaur", "ivysaur", "venusaur", "chikorita", "bayleef", "meganium"),
        members.apply("ability-espesura"));
    assertTrue(members.apply("ability-levitacion").contains("gastly"));
    assertTrue(members.apply("letter-p").containsAll(List.of("pikachu", "psyduck", "pidgey")));
    assertFalse(members.apply("letter-p").contains("bulbasaur"));
    assertTrue(members.apply("tiny").contains("diglett"));
  }

  @Test
  void familiesGroupRelatedCategories() {
    var types = PokemonConnectionsCatalog.categoryFamily("type-fire");
    for (var id : List.of("type-water", "mono-fire", "dual-normal-flying", "single-type", "dual-type")) {
      assertEquals(types, PokemonConnectionsCatalog.categoryFamily(id), id);
    }
    var starters = PokemonConnectionsCatalog.categoryFamily("grass-partners");
    for (var id : List.of("fire-partners", "water-partners", "final-starters", "ability-espesura",
        "ability-mar-llamas", "ability-torrente")) {
      assertEquals(starters, PokemonConnectionsCatalog.categoryFamily(id), id);
    }
    assertEquals(PokemonConnectionsCatalog.categoryFamily("ability-levitacion"),
        PokemonConnectionsCatalog.categoryFamily("ability-robustez"));
    assertEquals(PokemonConnectionsCatalog.categoryFamily("letter-a"),
        PokemonConnectionsCatalog.categoryFamily("letter-t"));
    assertEquals(PokemonConnectionsCatalog.categoryFamily("generation-1"),
        PokemonConnectionsCatalog.categoryFamily("generation-2"));
    assertEquals(PokemonConnectionsCatalog.categoryFamily("evolution-first"),
        PokemonConnectionsCatalog.categoryFamily("single-stage"));
    assertEquals(PokemonConnectionsCatalog.categoryFamily("trade-evolution"),
        PokemonConnectionsCatalog.categoryFamily("stone-evolution"));
    assertEquals(PokemonConnectionsCatalog.categoryFamily("legendary"),
        PokemonConnectionsCatalog.categoryFamily("mythical"));
    assertEquals(PokemonConnectionsCatalog.categoryFamily("giants"),
        PokemonConnectionsCatalog.categoryFamily("tiny"));
    for (var group : List.of(
        List.of("kanto-gym-aces", "johto-gym-aces", "hoenn-gym-aces", "sinnoh-gym-aces", "unova-gym-aces",
            "kalos-gym-aces", "galar-gym-aces", "paldea-gym-aces"),
        List.of("champion-aces", "villain-aces"),
        List.of("ash-team", "ash-kanto-team", "misty-team", "brock-team", "team-rocket"),
        List.of("regional-birds", "route-one-normals", "early-forest-bugs"),
        List.of("pseudo-final", "pseudo-first"),
        List.of("trees", "plant-lookalikes"),
        List.of("disguises", "pokeball-lookalikes"),
        List.of("headwear", "leaf-heads", "royalty"),
        List.of("warriors", "martial-artists", "swords-of-justice"),
        List.of("mustaches", "cats", "rodents"),
        List.of("slimy", "pollution"),
        List.of("trade-item-evolution", "trade-evolution"))) {
      for (var id : group) {
        assertEquals(PokemonConnectionsCatalog.categoryFamily(group.getFirst()),
            PokemonConnectionsCatalog.categoryFamily(id), id);
      }
    }
    assertEquals("dogs", PokemonConnectionsCatalog.categoryFamily("dogs"));
    assertTrue(!PokemonConnectionsCatalog.categoryFamily("dogs")
        .equals(PokemonConnectionsCatalog.categoryFamily("cats")));
  }

  /** Veinte puzles seguidos con el catálogo de la fixture: siempre dinámicos y sin repetir familia en un tablero. */
  @Test
  void consecutivePuzzlesAreDynamicAndMixFamilies() {
    for (var generations : List.of(List.of(1), List.of(1, 2))) {
      var context = GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(42))
          .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).build();
      var used = new ArrayList<String>();
      var categoriesSeen = new HashSet<String>();
      for (int round = 0; round < 20; round++) {
        var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context,
            new PuzzleOptions(4, 16, generations, List.copyOf(used), List.of()));
        assertEquals("DYNAMIC", puzzle.source());
        var families = puzzle.groups().stream()
            .map(group -> PokemonConnectionsCatalog.categoryFamily(group.categoryId())).toList();
        assertEquals(families.size(), new HashSet<>(families).size(), puzzle.key());
        puzzle.groups().stream().map(ConnectionAnswerGroup::categoryId).forEach(categoriesSeen::add);
        used.add(puzzle.key());
      }
      assertTrue(categoriesSeen.size() >= 30, generations + ": " + categoriesSeen);
    }
  }
}
