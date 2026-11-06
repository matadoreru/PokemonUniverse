package es.pokemonuniverse.domain.pokemon;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Vista del catálogo vigente limitada a los ids fijados de un día del reto y en su orden: {@code all()} y
 * {@code forGenerations()} siguen ese orden, y {@code byId()} y {@code byDexNumber()} solo encuentran ids de la lista,
 * así que un Pokémon que llega con la sincronización del día no entra hasta el día siguiente. Un id fijado que ya no
 * existe se omite y queda en {@link #missingIds()} (el servicio del reto registra el aviso; el dominio no tiene log).
 * Los datos de cada Pokémon (stats, sprites, learnsets) son los vigentes.
 *
 * <p>Declara las tres capacidades del catálogo de producción ({@link InMemoryPokemonCatalog}): Learnset Guess exige
 * {@link LearnsetPokemonCatalog} con {@code instanceof}, y Pokédle las cadenas evolutivas. Si el catálogo envuelto no
 * tiene una capacidad, la vista responde vacío en lugar de fallar. Las consultas por un id fuera de la lista, y las
 * aristas evolutivas que salen de ella, también dan vacío, como hace {@link InMemoryPokemonCatalog} con las aristas
 * fuera de su catálogo.
 */
public final class PinnedPokemonCatalog
    implements LearnsetPokemonCatalog, PokedexEntryPokemonCatalog, EvolutionPokemonCatalog {

  private final PokemonCatalog current;
  private final List<Pokemon> entries;
  private final Map<String, Pokemon> idIndex = new HashMap<>();
  private final Map<Integer, Pokemon> dexIndex = new HashMap<>();
  private final List<String> missingIds;

  private PinnedPokemonCatalog(PokemonCatalog current, List<String> pinnedIds) {
    this.current = current;
    var kept = new ArrayList<Pokemon>();
    var missing = new ArrayList<String>();
    for (var id : pinnedIds) {
      var pokemon = current.byId(id);
      if (pokemon.isEmpty()) {
        missing.add(id);
        continue;
      }
      // Una lista repetida no duplica entradas: cuenta la primera aparición.
      if (idIndex.putIfAbsent(id, pokemon.get()) != null) continue;
      kept.add(pokemon.get());
      if (pokemon.get().isDefault()) dexIndex.putIfAbsent(pokemon.get().nationalDexNumber(), pokemon.get());
    }
    this.entries = List.copyOf(kept);
    this.missingIds = List.copyOf(missing);
  }

  public static PinnedPokemonCatalog of(PokemonCatalog current, List<String> pinnedIds) {
    return new PinnedPokemonCatalog(current, pinnedIds);
  }

  /** Ids fijados que el catálogo vigente ya no tiene, en el orden de la lista. */
  public List<String> missingIds() {
    return missingIds;
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

  /** El mismo filtro que {@link InMemoryPokemonCatalog#forGenerations}, sobre el orden fijado. */
  @Override
  public List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms) {
    Set<Integer> allowed = Set.copyOf(generations);
    return entries.stream()
        .filter(pokemon -> allowed.contains(pokemon.generation()) && (includeForms || pokemon.isDefault()))
        .toList();
  }

  @Override
  public List<ResolvedLevelUpMove> levelUpMoves(String pokemonId, int referenceGeneration) {
    if (!idIndex.containsKey(pokemonId) || !(current instanceof LearnsetPokemonCatalog learnsets)) return List.of();
    return learnsets.levelUpMoves(pokemonId, referenceGeneration);
  }

  @Override
  public Optional<PokemonEvolutionInfo> evolutionInfo(String pokemonId) {
    if (!idIndex.containsKey(pokemonId) || !(current instanceof LearnsetPokemonCatalog learnsets)) {
      return Optional.empty();
    }
    return learnsets.evolutionInfo(pokemonId);
  }

  @Override
  public List<PokedexEntry> pokedexEntries(String pokemonId) {
    if (!idIndex.containsKey(pokemonId) || !(current instanceof PokedexEntryPokemonCatalog entriesCatalog)) {
      return List.of();
    }
    return entriesCatalog.pokedexEntries(pokemonId);
  }

  @Override
  public Optional<String> preEvolutionId(String pokemonId) {
    if (!idIndex.containsKey(pokemonId) || !(current instanceof EvolutionPokemonCatalog links)) return Optional.empty();
    return links.preEvolutionId(pokemonId).filter(idIndex::containsKey);
  }

  @Override
  public List<String> evolutionIds(String pokemonId) {
    if (!idIndex.containsKey(pokemonId) || !(current instanceof EvolutionPokemonCatalog links)) return List.of();
    return links.evolutionIds(pokemonId).stream().filter(idIndex::containsKey).toList();
  }
}
