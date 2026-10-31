package es.pokemonuniverse.domain.pokemon;

import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** {@code InMemoryPokemonAudioCatalog} de {@code audio-assets.ts}: una URL por {@code (pokemonId, kind)}. */
public final class InMemoryPokemonAudioCatalog implements PokemonAudioCatalog {

  public static final String CRY_LATEST = "CRY_LATEST";
  public static final String CRY_LEGACY = "CRY_LEGACY";

  public record Entry(String pokemonId, String kind, String url) {}

  private final Map<String, String> sources = new LinkedHashMap<>();

  public InMemoryPokemonAudioCatalog(List<Entry> entries) {
    // Como new Map(entries): con claves repetidas gana la última.
    for (var entry : entries) sources.put(entry.pokemonId() + ":" + entry.kind(), entry.url());
  }

  public static String kindFor(CryVersion version) {
    return version == CryVersion.LATEST ? CRY_LATEST : CRY_LEGACY;
  }

  @Override
  @Nullable
  public String cryFor(String pokemonId, CryVersion version) {
    return sources.get(pokemonId + ":" + kindFor(version));
  }

  @Override
  public List<String> pokemonIds(@Nullable CryVersion version) {
    var suffix = version == null ? null : ":" + kindFor(version);
    var ids = new LinkedHashSet<String>();
    for (var key : sources.keySet()) {
      if (suffix == null || key.endsWith(suffix)) ids.add(key.substring(0, key.indexOf(':')));
    }
    return List.copyOf(new ArrayList<>(ids));
  }
}
