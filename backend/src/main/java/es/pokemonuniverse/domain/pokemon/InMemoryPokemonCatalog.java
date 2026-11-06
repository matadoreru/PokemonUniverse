package es.pokemonuniverse.domain.pokemon;

import es.pokemonuniverse.domain.text.Collations;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Traducción de {@code InMemoryPokemonCatalog} de {@code apps/server/src/pokemon/catalog.ts}. Recorre las entradas en
 * el orden recibido: una forma no por defecto se conserva solo si {@link RegionalForms#isSupported}; una por defecto,
 * solo si es la primera de su número de Pokédex. Los movimientos por nivel de un movimiento desconocido se descartan;
 * cada lista se ordena por nivel y después por nombre del movimiento, y las entradas de Pokédex por generación
 * descendente y después por versión, ambas con {@link Collations#names()} en lugar de {@code localeCompare} y con
 * ordenación estable como {@code Array.prototype.sort}.
 */
public final class InMemoryPokemonCatalog
    implements LearnsetPokemonCatalog, PokedexEntryPokemonCatalog, EvolutionPokemonCatalog {

  private static final Comparator<ResolvedLevelUpMove> LEARNSET_ORDER = Comparator
      .comparingInt(ResolvedLevelUpMove::level)
      .thenComparing(m -> m.move().name(), Collations.names());
  private static final Comparator<PokedexEntry> POKEDEX_ORDER = Comparator
      .comparingInt(PokedexEntry::generation).reversed()
      .thenComparing(PokedexEntry::version, Collations.names());

  private final List<Pokemon> entries;
  private final Map<String, Pokemon> idIndex = new HashMap<>();
  private final Map<Integer, Pokemon> dexIndex = new HashMap<>();
  private final Map<String, List<ResolvedLevelUpMove>> learnsetIndex;
  private final Map<String, PokemonEvolutionInfo> evolutionIndex;
  private final Map<String, List<PokedexEntry>> pokedexEntryIndex;
  private final Map<String, String> preEvolutionIndex;
  private final Map<String, List<String>> evolutionsIndex;

  public InMemoryPokemonCatalog(List<Pokemon> entries) {
    this(entries, List.of(), List.of(), Map.of(), List.of());
  }

  public InMemoryPokemonCatalog(List<Pokemon> entries, List<Move> moves, List<LearnsetEntry> learnsets,
      Map<String, PokemonEvolutionInfo> evolution, List<PokedexEntry> pokedexEntries) {
    this(entries, moves, learnsets, evolution, pokedexEntries, List.of());
  }

  /** Con las aristas de las cadenas evolutivas; las que nombran un Pokémon fuera del catálogo se descartan. */
  public InMemoryPokemonCatalog(List<Pokemon> entries, List<Move> moves, List<LearnsetEntry> learnsets,
      Map<String, PokemonEvolutionInfo> evolution, List<PokedexEntry> pokedexEntries,
      List<PokemonEvolutionLink> evolutionLinks) {
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
    var moveIndex = new HashMap<String, Move>();
    for (var move : moves) moveIndex.put(move.id(), move);
    var learnsetLists = new HashMap<String, List<ResolvedLevelUpMove>>();
    for (var entry : learnsets) {
      var move = moveIndex.get(entry.moveId());
      if (move == null) continue;
      learnsetLists.computeIfAbsent(learnsetKey(entry.pokemonId(), entry.referenceGeneration()), k -> new ArrayList<>())
          .add(new ResolvedLevelUpMove(entry.moveId(), entry.level(), move));
    }
    this.learnsetIndex = sortedCopies(learnsetLists, LEARNSET_ORDER);
    this.evolutionIndex = Map.copyOf(evolution);
    var pokedexLists = new HashMap<String, List<PokedexEntry>>();
    for (var entry : pokedexEntries) pokedexLists.computeIfAbsent(entry.pokemonId(), k -> new ArrayList<>()).add(entry);
    this.pokedexEntryIndex = sortedCopies(pokedexLists, POKEDEX_ORDER);
    var parents = new HashMap<String, String>();
    var children = new HashMap<String, List<String>>();
    for (var link : evolutionLinks) {
      if (!idIndex.containsKey(link.fromPokemonId()) || !idIndex.containsKey(link.toPokemonId())) continue;
      parents.put(link.toPokemonId(), link.fromPokemonId());
      children.computeIfAbsent(link.fromPokemonId(), k -> new ArrayList<>()).add(link.toPokemonId());
    }
    this.preEvolutionIndex = Map.copyOf(parents);
    var frozenChildren = new HashMap<String, List<String>>();
    children.forEach((id, list) -> frozenChildren.put(id, List.copyOf(list)));
    this.evolutionsIndex = Map.copyOf(frozenChildren);
  }

  private static String learnsetKey(String pokemonId, int referenceGeneration) {
    return pokemonId + ":" + referenceGeneration;
  }

  /** {@link List#sort} es estable, como {@code Array.prototype.sort}; las listas resultantes son inmutables. */
  private static <T> Map<String, List<T>> sortedCopies(Map<String, List<T>> lists, Comparator<T> order) {
    var result = new HashMap<String, List<T>>();
    lists.forEach((key, list) -> {
      list.sort(order);
      result.put(key, List.copyOf(list));
    });
    return Map.copyOf(result);
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

  @Override
  public List<ResolvedLevelUpMove> levelUpMoves(String pokemonId, int referenceGeneration) {
    return learnsetIndex.getOrDefault(learnsetKey(pokemonId, referenceGeneration), List.of());
  }

  @Override
  public Optional<PokemonEvolutionInfo> evolutionInfo(String pokemonId) {
    return Optional.ofNullable(evolutionIndex.get(pokemonId));
  }

  @Override
  public List<PokedexEntry> pokedexEntries(String pokemonId) {
    return pokedexEntryIndex.getOrDefault(pokemonId, List.of());
  }

  @Override
  public Optional<String> preEvolutionId(String pokemonId) {
    return Optional.ofNullable(preEvolutionIndex.get(pokemonId));
  }

  @Override
  public List<String> evolutionIds(String pokemonId) {
    return evolutionsIndex.getOrDefault(pokemonId, List.of());
  }
}
