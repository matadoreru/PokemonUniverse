package es.pokemonuniverse.domain.game.engines.pokeddlerace;

import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.EvolutionValue;
import es.pokemonuniverse.domain.pokemon.EvolutionPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Etapa evolutiva de la partida: cuenta solo los miembros de la familia cuya generación está entre las elegidas.
 * {@code stage} es 1 más los antepasados válidos (los demás se saltan); {@code stages}, la cadena válida más larga de
 * la familia, medida desde la raíz completa. Un miembro sin descendientes válidos es final de su rama
 * ({@code stage = stages}), como en {@code PokemonCatalogSeeder.syncEvolution}. Con todas las generaciones coincide con
 * la etapa sembrada.
 */
final class PokeddleEvolutions {

  private PokeddleEvolutions() {}

  /** Una entrada por Pokémon del pool. Sin aristas en el catálogo se usa la etapa sembrada (o 1/1 si falta). */
  static Map<String, EvolutionValue> forPool(PokemonCatalog catalog, List<Pokemon> pool, List<Integer> generations) {
    var result = new LinkedHashMap<String, EvolutionValue>();
    if (!(catalog instanceof EvolutionPokemonCatalog links)) {
      for (var pokemon : pool) result.put(pokemon.id(), stored(pokemon));
      return result;
    }
    var family = new Family(links, Set.copyOf(generations));
    for (var pokemon : pool) result.put(pokemon.id(), family.value(pokemon.id()));
    return result;
  }

  private static EvolutionValue stored(Pokemon pokemon) {
    return new EvolutionValue(orOne(pokemon.evolutionStage()), orOne(pokemon.evolutionStageCount()));
  }

  private static int orOne(Integer value) {
    return value == null ? 1 : value;
  }

  /** Recorridos de la familia con memoria de la cadena válida más larga que cuelga de cada miembro. */
  private static final class Family {

    private final EvolutionPokemonCatalog catalog;
    private final Set<Integer> generations;
    private final Map<String, Integer> longestFrom = new HashMap<>();

    Family(EvolutionPokemonCatalog catalog, Set<Integer> generations) {
      this.catalog = catalog;
      this.generations = generations;
    }

    EvolutionValue value(String id) {
      int ancestors = 0;
      var root = id;
      for (var parent = catalog.preEvolutionId(id); parent.isPresent(); parent = catalog.preEvolutionId(root)) {
        root = parent.get();
        if (valid(root)) ancestors++;
      }
      int stages = Math.max(1, longest(root));
      // Sin descendientes válidos es final de su rama aunque otra rama de la familia sea más larga.
      boolean terminal = longest(id) <= 1;
      return new EvolutionValue(terminal ? stages : ancestors + 1, stages);
    }

    private boolean valid(String id) {
      return catalog.byId(id).map(pokemon -> generations.contains(pokemon.generation())).orElse(false);
    }

    /** Miembros válidos de la cadena más larga que empieza en {@code id}, incluido él si es válido. */
    private int longest(String id) {
      var known = longestFrom.get(id);
      if (known != null) return known;
      int deepest = 0;
      for (var child : catalog.evolutionIds(id)) deepest = Math.max(deepest, longest(child));
      int length = deepest + (valid(id) ? 1 : 0);
      longestFrom.put(id, length);
      return length;
    }
  }
}
