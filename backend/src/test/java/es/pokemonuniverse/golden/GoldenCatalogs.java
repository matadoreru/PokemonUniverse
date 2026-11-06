package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.LearnsetEntry;
import es.pokemonuniverse.domain.pokemon.Move;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionInfo;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionLink;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.core.type.Argument;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Carga {@code golden/catalog/<fixtureId>.json} con el mismo filtrado y orden que producción. */
public final class GoldenCatalogs {

  private GoldenCatalogs() {}

  public static InMemoryPokemonCatalog load(String fixtureId) {
    return load(fixtureId, null);
  }

  /**
   * Con {@code catalogPatch} (como {@code loadGoldenCatalog} de {@code golden/catalog.ts}): superpone la paleta a las
   * filas parcheadas antes de construir el catálogo; un id que no está en la fixture es un error.
   */
  public static InMemoryPokemonCatalog load(String fixtureId, @Nullable Map<String, GoldenFixture.PalettePatch> patch) {
    var root = root(fixtureId);
    var mapper = ObjectMapper.getDefault();
    try {
      var rows = mapper.readValueFromTree(root.get("pokemon"), Argument.listOf(Pokemon.class));
      return new InMemoryPokemonCatalog(
          patch == null ? rows : applyPatch(rows, patch),
          mapper.readValueFromTree(root.get("moves"), Argument.listOf(Move.class)),
          mapper.readValueFromTree(root.get("learnsets"), Argument.listOf(LearnsetEntry.class)),
          mapper.readValueFromTree(root.get("evolution"),
              Argument.mapOf(Argument.STRING, Argument.of(PokemonEvolutionInfo.class))),
          mapper.readValueFromTree(root.get("pokedexEntries"), Argument.listOf(PokedexEntry.class)),
          // Aristas de la tabla "PokemonEvolution" entre Pokémon de la fixture (añadidas a mano desde la BD sembrada).
          root.get("evolutionLinks") == null ? List.of()
              : mapper.readValueFromTree(root.get("evolutionLinks"), Argument.listOf(PokemonEvolutionLink.class)));
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo interpretar la fixture " + fixtureId, e);
    }
  }

  /** {@code applyCatalogPatch} de {@code golden/catalog-patch.ts}. */
  static List<Pokemon> applyPatch(List<Pokemon> rows, Map<String, GoldenFixture.PalettePatch> patch) {
    var known = rows.stream().map(Pokemon::id).collect(Collectors.toSet());
    var unknown = patch.keySet().stream().filter(id -> !known.contains(id)).toList();
    if (!unknown.isEmpty()) {
      throw new IllegalStateException("catalogPatch con Pokémon fuera del catálogo: " + String.join(", ", unknown));
    }
    return rows.stream().map(row -> {
      var entry = patch.get(row.id());
      return entry == null ? row : row.withPalette(entry.palette(), entry.paletteWeights());
    }).toList();
  }

  /** Filas tal cual están en la fixture, antes del filtro del catálogo. */
  public static List<Pokemon> pokemon(String fixtureId) {
    return list(fixtureId, "pokemon", Pokemon.class);
  }

  /** Movimientos por nivel en el orden en que los exportó Node (ya ordenados por su catálogo). */
  public static List<LearnsetEntry> learnsets(String fixtureId) {
    return list(fixtureId, "learnsets", LearnsetEntry.class);
  }

  /** Entradas de Pokédex en el orden en que las exportó Node (ya ordenadas por su catálogo). */
  public static List<PokedexEntry> pokedexEntries(String fixtureId) {
    return list(fixtureId, "pokedexEntries", PokedexEntry.class);
  }

  private static <T> List<T> list(String fixtureId, String key, Class<T> type) {
    try {
      return ObjectMapper.getDefault().readValueFromTree(root(fixtureId).get(key), Argument.listOf(type));
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo interpretar la fixture " + fixtureId, e);
    }
  }

  private static JsonNode root(String fixtureId) {
    var resource = "golden/catalog/" + fixtureId + ".json";
    try (var in = GoldenCatalogs.class.getClassLoader().getResourceAsStream(resource)) {
      if (in == null) throw new IllegalStateException("Falta la fixture " + resource);
      return ObjectMapper.getDefault().readValue(in, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo leer " + resource, e);
    }
  }
}
