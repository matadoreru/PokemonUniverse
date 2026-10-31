package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
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
    return new InMemoryPokemonCatalog(pokemon(fixtureId));
  }

  /** Filas tal cual están en la fixture, antes del filtro del catálogo. */
  public static List<Pokemon> pokemon(String fixtureId) {
    var resource = "golden/catalog/" + fixtureId + ".json";
    try (var in = GoldenCatalogs.class.getClassLoader().getResourceAsStream(resource)) {
      if (in == null) throw new IllegalStateException("Falta la fixture " + resource + ". Ejecuta npm run golden:catalog");
      var mapper = ObjectMapper.getDefault();
      var root = mapper.readValue(in, JsonNode.class);
      return mapper.readValueFromTree(root.get("pokemon"), Argument.listOf(Pokemon.class));
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo leer " + resource, e);
    }
  }
}
