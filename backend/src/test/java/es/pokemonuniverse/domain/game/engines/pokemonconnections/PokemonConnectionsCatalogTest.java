package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CategoryDefinition;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CuratedTemplate;
import java.util.List;
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
    "crustaceans", "frogs", "rabbits", "foxes", "bats", "penguins", "owls", "pigs", "elephants", "sharks",
    "mushrooms", "flowers", "musical", "pokeball-lookalikes", "multiple-heads", "ancient-future-paradox",
    "ultra-beasts", "regi-family", "rodents", "spiders", "butterflies-moths", "fish", "sheep-goats", "ducks",
    "legendary-birds", "legendary-beasts", "weather-trio", "lake-guardians", "creation-trio", "swords-of-justice",
    "forces-of-nature", "tapu-guardians", "treasures-of-ruin", "loyal-three-and-master", "mythical-balanced-stats",
  };

  private static final String[] TEMPLATE_IDS = {
    "classic-connections", "companions-connections", "first-partners-connections", "evolution-methods-connections",
    "animal-shapes-connections", "nature-connections", "legendary-groups-connections", "wildlife-connections",
  };

  @Test
  void categoriesKeepTheTsCountAndOrder() {
    var catalog = PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG;
    assertEquals(57, catalog.size());
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
    var last = PokemonConnectionsCatalog.CONNECTION_CATEGORY_CATALOG.getLast();
    assertEquals("Singulares con 100 en cada estadística", last.label());
    assertEquals("Sus seis estadísticas base tienen exactamente 100 puntos.", last.explanation());
    assertEquals(List.of("mew", "celebi", "jirachi", "manaphy", "shaymin-land"), last.pokemonIds());
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
