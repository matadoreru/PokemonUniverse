package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.domain.pokemon.InMemoryPokemonAudioCatalog;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonAudioCatalog.Entry;
import io.micronaut.data.model.Sort;
import jakarta.inject.Singleton;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * {@code loadPokemonAudioCatalog} de {@code audio-assets.ts}: referencias {@code CRY_*} de "PokemonAssetReference" y,
 * detrás, los gritos heredados de {@code Pokemon.metadata.cries}. Solo URL del repositorio de gritos de PokeAPI; la
 * primera por {@code (pokemonId, kind)} gana.
 */
@Singleton
public class JpaPokemonAudioCatalog {

  private static final Pattern TRUSTED_CRY = Pattern.compile("^https://raw\\.githubusercontent\\.com/PokeAPI/cries/");
  private static final Sort ORDER = Sort.of(Sort.Order.asc("pokemonId"), Sort.Order.asc("kind"),
      Sort.Order.desc("isPrimary"), Sort.Order.desc("updatedAt"));

  private final PokemonAssetReferenceRepository references;
  private final PokemonRepository pokemon;

  public JpaPokemonAudioCatalog(PokemonAssetReferenceRepository references, PokemonRepository pokemon) {
    this.references = references;
    this.pokemon = pokemon;
  }

  public InMemoryPokemonAudioCatalog load() {
    var candidates = new ArrayList<Entry>();
    for (var row : references.findByKindIn(
        List.of(InMemoryPokemonAudioCatalog.CRY_LATEST, InMemoryPokemonAudioCatalog.CRY_LEGACY), ORDER)) {
      candidates.add(new Entry(row.getPokemonId(), row.getKind(), row.getUrl()));
    }
    for (var row : pokemon.findAll()) candidates.addAll(metadataCries(row.getId(), row.getMetadata()));
    var unique = new LinkedHashMap<String, Entry>();
    for (var entry : candidates) {
      if (!TRUSTED_CRY.matcher(entry.url()).find()) continue;
      unique.putIfAbsent(entry.pokemonId() + ":" + entry.kind(), entry);
    }
    return new InMemoryPokemonAudioCatalog(List.copyOf(unique.values()));
  }

  /** {@code metadataCries}: {@code cries.latest} y {@code cries.legacy} si son cadenas no vacías. */
  static List<Entry> metadataCries(String pokemonId, Map<String, Object> metadata) {
    if (metadata == null || !(metadata.get("cries") instanceof Map<?, ?> cries)) return List.of();
    var entries = new ArrayList<Entry>();
    if (cries.get("latest") instanceof String url && !url.isEmpty()) {
      entries.add(new Entry(pokemonId, InMemoryPokemonAudioCatalog.CRY_LATEST, url));
    }
    if (cries.get("legacy") instanceof String url && !url.isEmpty()) {
      entries.add(new Entry(pokemonId, InMemoryPokemonAudioCatalog.CRY_LEGACY, url));
    }
    return entries;
  }
}
