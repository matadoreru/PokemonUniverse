package es.pokemonuniverse.application.pokemon;

import es.pokemonuniverse.adapters.out.persistence.PokemonEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonRepository;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.RegionalForms;
import io.micronaut.data.model.Sort;
import jakarta.inject.Singleton;
import java.text.Collator;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

/** Catálogo público: carga todas las filas, aplica el filtro de formas del catálogo y las cachea una hora. */
@Singleton
public class PokemonCatalogService {

  static final Duration TTL = Duration.ofHours(1);
  private static final Sort BASE_ORDER = Sort.of(
      Sort.Order.asc("nationalDexNumber"), Sort.Order.desc("isDefault"), Sort.Order.asc("name"),
      Sort.Order.desc("updatedAt"), Sort.Order.asc("id"));

  private record Cached(List<Pokemon> list, Instant loadedAt) {}

  private final PokemonRepository repository;
  private final AtomicReference<Cached> cache = new AtomicReference<>();

  public PokemonCatalogService(PokemonRepository repository) {
    this.repository = repository;
  }

  public List<Pokemon> search(PokemonSearchQuery query) {
    var allowed = Set.copyOf(query.generations());
    var collator = Collator.getInstance(Locale.ROOT);
    var order = Comparator.comparingInt(Pokemon::nationalDexNumber)
        .thenComparing(p -> p.isDefault() ? 0 : 1)
        .thenComparing(Pokemon::name, collator);
    return base().stream()
        .filter(p -> allowed.isEmpty() || allowed.contains(p.generation()))
        .filter(p -> query.includeForms() || p.isDefault())
        .sorted(order)
        .toList();
  }

  /** Descarta la caché; la siguiente búsqueda recarga desde la base de datos. */
  public void refresh() {
    cache.set(null);
  }

  private List<Pokemon> base() {
    var current = cache.get();
    if (current == null || current.loadedAt().plus(TTL).isBefore(Instant.now())) {
      current = new Cached(load(), Instant.now());
      cache.set(current);
    }
    return current.list();
  }

  private List<Pokemon> load() {
    var seenDefaults = new HashSet<Integer>();
    var result = new ArrayList<Pokemon>();
    for (var row : repository.findAll(BASE_ORDER)) {
      if (!row.getIsDefault()) {
        if (!RegionalForms.isSupported(row.getId())) continue;
      } else if (!seenDefaults.add(row.getNationalDexNumber())) {
        continue;
      }
      result.add(toPokemon(row));
    }
    return List.copyOf(result);
  }

  private static Pokemon toPokemon(PokemonEntity r) {
    var metadata = r.getMetadata();
    var shiny = metadata != null && metadata.get("shinySprite") instanceof String s ? s : null;
    Map<String, Object> names = r.getNames();
    return new Pokemon(r.getId(), r.getNationalDexNumber(), r.getName(), r.getGeneration(), r.getIsDefault(),
        r.getSprite(), shiny, r.getHp(), r.getAttack(), r.getDefense(), r.getSpecialAttack(),
        r.getSpecialDefense(), r.getSpeed(), r.getBaseStatTotal(), r.getHeightDecimeters(),
        r.getWeightHectograms(), nonZero(r.getEvolutionStage()), nonZero(r.getEvolutionStages()),
        r.getLegendaryStatus(), r.getColor(), list(r.getAbilities()), names, list(r.getTypes()));
  }

  private static Integer nonZero(Integer v) {
    return v == null || v == 0 ? null : v;
  }

  private static List<String> list(String[] a) {
    return a == null ? List.of() : List.of(a);
  }
}
