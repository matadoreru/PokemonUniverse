package es.pokemonuniverse.domain.pokemon;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Traducción de {@code InMemoryPokemonCatalog} de {@code apps/server/src/pokemon/catalog.ts}. Recorre las entradas en
 * el orden recibido: una forma no por defecto se conserva solo si {@link RegionalForms#isSupported}; una por defecto,
 * solo si es la primera de su número de Pokédex.
 */
public final class InMemoryPokemonCatalog implements PokemonCatalog {

  private final List<Pokemon> entries;
  private final Map<String, Pokemon> idIndex = new HashMap<>();
  private final Map<Integer, Pokemon> dexIndex = new HashMap<>();

  public InMemoryPokemonCatalog(List<Pokemon> entries) {
    var defaultDexNumbers = new HashSet<Integer>();
    var kept = new ArrayList<Pokemon>();
    for (var pokemon : entries) {
      boolean keep = pokemon.isDefault()
          ? defaultDexNumbers.add(pokemon.nationalDexNumber())
          : RegionalForms.isSupported(pokemon.id());
      if (keep) kept.add(pokemon);
    }
    this.entries = List.copyOf(kept);
    for (var pokemon : this.entries) {
      idIndex.put(pokemon.id(), pokemon);
      if (pokemon.isDefault()) dexIndex.put(pokemon.nationalDexNumber(), pokemon);
    }
  }

  @Override
  public List<Pokemon> all() {
    return entries;
  }

  @Override
  public Optional<Pokemon> byId(String id) {
    return Optional.ofNullable(idIndex.get(id));
  }

  @Override
  public Optional<Pokemon> byDexNumber(int number) {
    return Optional.ofNullable(dexIndex.get(number));
  }

  @Override
  public List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms) {
    Set<Integer> allowed = Set.copyOf(generations);
    return entries.stream()
        .filter(pokemon -> allowed.contains(pokemon.generation()) && (includeForms || pokemon.isDefault()))
        .toList();
  }
}
