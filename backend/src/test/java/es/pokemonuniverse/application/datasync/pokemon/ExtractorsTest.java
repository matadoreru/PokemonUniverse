package es.pokemonuniverse.application.datasync.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Extractores de {@code ability-source.ts}, {@code learnset-source.ts}, {@code pokedex-entry-source.ts} y los
 * auxiliares de {@code pokemon-relation-reconciler.ts}: entradas de las fixtures grabadas y casos límite, salidas
 * obtenidas una vez de las funciones de Node ({@code expected-extractors.json}, {@code scripts/export-pokeapi-parity.mts}).
 */
class ExtractorsTest {

  private static final ObjectMapper JSON = ObjectMapper.getDefault();
  private static final JsonNode EXPECTED = read("/datasync/pokeapi/expected-extractors.json");

  static JsonNode read(String path) {
    try (InputStream in = ExtractorsTest.class.getResourceAsStream(path)) {
      if (in == null) throw new IOException("missing " + path);
      return JSON.readValue(in.readAllBytes(), JsonNode.class);
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  private static JsonNode api(String path) {
    return read("/datasync/pokeapi/api/v2/" + path);
  }

  private static Object plain(JsonNode node) {
    if (node.isNull()) return null;
    if (node.isString()) return node.getStringValue();
    if (node.isBoolean()) return node.getBooleanValue();
    if (node.isNumber()) return node.getNumberValue().doubleValue();
    if (node.isArray()) {
      var list = new ArrayList<Object>();
      node.values().forEach(value -> list.add(plain(value)));
      return list;
    }
    var map = new LinkedHashMap<String, Object>();
    node.entries().forEach(entry -> map.put(entry.getKey(), plain(entry.getValue())));
    return map;
  }

  private static Object entries(List<LearnsetExtractor.LevelUpEntry> entries) {
    return entries.stream().map(entry -> (Object) Map.of("pokemonId", entry.pokemonId(), "moveId", entry.moveId(),
        "referenceGeneration", (double) entry.referenceGeneration(), "level", (double) entry.level())).toList();
  }

  private static Object pokedex(List<PokedexEntryExtractor.Entry> entries) {
    return entries.stream().map(entry -> (Object) Map.of("pokemonId", entry.pokemonId(), "text", entry.text(),
        "language", entry.language(), "generation", (double) entry.generation(), "version", entry.version(),
        "versionLabel", entry.versionLabel())).toList();
  }

  @Test
  void spanishAbilityNamesMatchNode() {
    for (var id : List.of(5, 8, 42, 69, 206)) {
      var ability = api("ability/" + id + ".json");
      assertEquals(EXPECTED.get("abilities").get(ability.get("name").getStringValue()).getStringValue(),
          AbilityNameExtractor.spanishName(PokeApiPayloads.names(ability.get("names"))));
    }
  }

  @Test
  void abilityNameEdgeCasesMatchNode() {
    var cases = List.of(
        List.of(new PokeApiPayloads.LocalizedName("Inner Focus", "en"),
            new PokeApiPayloads.LocalizedName("  Foco Interno  ", "es")),
        List.of(new PokeApiPayloads.LocalizedName("Overgrow", "en")),
        // La primera entrada en español gana aunque quede vacía: no se busca otra.
        List.of(new PokeApiPayloads.LocalizedName("  ", "es"), new PokeApiPayloads.LocalizedName("Segundo", "es")));
    var expected = EXPECTED.get("abilityNameCases");
    for (int i = 0; i < cases.size(); i++) {
      assertEquals(plain(expected.get(i)), AbilityNameExtractor.spanishName(cases.get(i)), "case " + i);
    }
  }

  @Test
  void canonicalLearnsetsMatchNodeForEveryIntroductionGeneration() {
    for (var number : List.of(74, 75, 76)) {
      var pokemon = api("pokemon/" + number + ".json");
      var name = pokemon.get("name").getStringValue();
      for (var generation : List.of(1, 3, 9)) {
        var actual = LearnsetExtractor.canonicalLevelUp(name, generation, PokeApiPayloads.moves(pokemon.get("moves")));
        assertEquals(plain(EXPECTED.get("learnsets").get(name + "@" + generation)), entries(actual), name + "@" + generation);
      }
    }
  }

  @Test
  void learnsetsKeepOnlyCanonicalLevelUpDetails() {
    // Casos de learnset-source.test.ts.
    var moves = List.of(new PokeApiPayloads.SourceMove("tackle", List.of(
        new PokeApiPayloads.VersionDetail(1, "level-up", "yellow"),
        new PokeApiPayloads.VersionDetail(5, "machine", "yellow"),
        new PokeApiPayloads.VersionDetail(3, "tutor", "yellow"),
        new PokeApiPayloads.VersionDetail(0, "level-up", "yellow"),
        new PokeApiPayloads.VersionDetail(2, "level-up", "red-blue"),
        new PokeApiPayloads.VersionDetail(4, "level-up", "crystal"))));
    assertEquals(List.of(new LearnsetExtractor.LevelUpEntry("pikachu", "tackle", 1, 1),
        new LearnsetExtractor.LevelUpEntry("pikachu", "tackle", 2, 4)), LearnsetExtractor.canonicalLevelUp("pikachu", 1, moves));
    assertEquals(List.of(), LearnsetExtractor.canonicalLevelUp("future", 3, moves));
  }

  @Test
  void spanishPokedexEntriesMatchNode() {
    for (var number : List.of(74, 75, 76)) {
      var species = api("pokemon-species/" + number + ".json");
      var name = api("pokemon/" + number + ".json").get("name").getStringValue();
      var actual = PokedexEntryExtractor.spanishEntries(name, PokeApiPayloads.flavorTexts(species.get("flavor_text_entries")));
      assertEquals(plain(EXPECTED.get("pokedexEntries").get(name)), pokedex(actual), name);
    }
  }

  @Test
  void pokedexEntriesDedupeByVersionAndSortLikeNode() {
    var source = List.of(
        new PokeApiPayloads.FlavorText("Primera\nversión", "es", "yellow"),
        new PokeApiPayloads.FlavorText("Segunda versión", "es", "yellow"),
        new PokeApiPayloads.FlavorText("Negro dos", "es", "black-2"),
        new PokeApiPayloads.FlavorText("Negro", "es", "black"),
        new PokeApiPayloads.FlavorText("   ", "es", "red"),
        new PokeApiPayloads.FlavorText("Futuro", "es", "future-game"),
        new PokeApiPayloads.FlavorText("English", "en", "blue"),
        new PokeApiPayloads.FlavorText("Leyendas", "es", "legends-arceus"),
        new PokeApiPayloads.FlavorText("Let’s Go", "es", "lets-go-eevee"));
    assertEquals(plain(EXPECTED.get("synthetic")), pokedex(PokedexEntryExtractor.spanishEntries("pikachu", source)));
  }

  @Test
  void pokedexTextNormalizationUsesJavaScriptWhitespace() {
    for (var item : EXPECTED.get("normalize").values()) {
      assertEquals(item.get("output").getStringValue(),
          PokedexEntryExtractor.normalize(item.get("input").getStringValue()), item.get("input").getStringValue());
    }
  }

  @Test
  void fallbackAbilityIdsMatchNode() {
    for (var item : EXPECTED.get("fallbackAbilityIds").values()) {
      assertEquals(item.get("id").getStringValue(),
          PokemonRelationReconciler.fallbackAbilityId(item.get("name").getStringValue()), item.get("name").getStringValue());
    }
  }

  @Test
  void desiredAbilitiesFromMetadataMatchNode() {
    var inputs = read("/datasync/pokeapi/metadata-cases.json");
    var expected = EXPECTED.get("metadataCases");
    for (int i = 0; i < inputs.size(); i++) {
      var actual = PokemonRelationReconciler.desiredAbilitiesFromMetadata(inputs.get(i), List.of("Cabeza Roca", "Robustez"))
          .stream().map(item -> (Object) Map.of("abilityId", item.abilityId(), "name", item.name(),
              "slot", (double) item.slot(), "isHidden", item.isHidden())).toList();
      assertEquals(plain(expected.get(i)), actual, "case " + i);
    }
  }
}
