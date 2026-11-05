package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CategoryDefinition;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CuratedTemplate;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * El catálogo literal frente al TS: los ids y su orden se exportaron una vez de {@code connectionCategoryCatalog} del
 * dist de shared ({@code npx tsx -e}). El orden alimenta {@code shuffled}, así que un cambio aquí rompe las fixtures.
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
    "bees", "snails-slugs", "deer", "fruits-vegetables", "royalty", "female-only", "male-only", "shape-head-only",
    "shape-multiple-bodies", "shape-tentacles", "heavyweights", "featherweights", "giants",
  };

  private static final String[] TEMPLATE_IDS = {
    "classic-connections", "companions-connections", "first-partners-connections", "evolution-methods-connections",
    "animal-shapes-connections", "nature-connections", "legendary-groups-connections", "wildlife-connections",
  };

  @Test
  void categoriesKeepTheTsCountAndOrder() {
    var catalog = PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG;
    assertEquals(93, catalog.size());
    assertArrayEquals(CATEGORY_IDS, catalog.stream().map(CategoryDefinition::id).toArray(String[]::new));
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
}
