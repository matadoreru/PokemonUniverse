package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.LearnsetEntry;
import es.pokemonuniverse.domain.pokemon.Move;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionInfo;
import io.micronaut.core.type.Argument;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

/** Carga {@code golden/catalog/<fixtureId>.json} con el mismo filtrado y orden que producción. */
public final class GoldenCatalogs {

  private GoldenCatalogs() {}

  public static InMemoryPokemonCatalog load(String fixtureId) {
    var root = root(fixtureId);
    var mapper = ObjectMapper.getDefault();
    try {
      return new InMemoryPokemonCatalog(
          mapper.readValueFromTree(root.get("pokemon"), Argument.listOf(Pokemon.class)),
          mapper.readValueFromTree(root.get("moves"), Argument.listOf(Move.class)),
          mapper.readValueFromTree(root.get("learnsets"), Argument.listOf(LearnsetEntry.class)),
          mapper.readValueFromTree(root.get("evolution"),
              Argument.mapOf(Argument.STRING, Argument.of(PokemonEvolutionInfo.class))),
          mapper.readValueFromTree(root.get("pokedexEntries"), Argument.listOf(PokedexEntry.class)));
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo interpretar la fixture " + fixtureId, e);
    }
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
      if (in == null) throw new IllegalStateException("Falta la fixture " + resource + ". Ejecuta npm run golden:catalog");
      return ObjectMapper.getDefault().readValue(in, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo leer " + resource, e);
    }
  }
}
