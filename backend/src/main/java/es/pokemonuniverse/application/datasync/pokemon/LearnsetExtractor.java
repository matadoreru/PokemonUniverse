package es.pokemonuniverse.application.datasync.pokemon;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code extractCanonicalLevelUpEntries} de {@code learnset-source.ts}: la única entrada de learnsets jugables desde
 * PokéAPI. Para cada generación de referencia g (1..9) no anterior a la de introducción se aceptan los detalles
 * {@code level-up} con nivel ≥ 1 del grupo de versiones canónico de g ({@code GENERATION_LEARNSET_SOURCES}); se
 * deduplica por {@code pokemon:move:gen:level} conservando el orden de primera aparición (un {@code Map} de JS).
 */
public final class LearnsetExtractor {

  /** {@code GENERATION_LEARNSET_SOURCES[g].versionGroup}, g = índice + 1. */
  static final List<String> VERSION_GROUPS = List.of("yellow", "crystal", "emerald", "heartgold-soulsilver",
      "black-2-white-2", "omega-ruby-alpha-sapphire", "ultra-sun-ultra-moon", "sword-shield", "scarlet-violet");

  public record LevelUpEntry(String pokemonId, String moveId, int referenceGeneration, int level) {}

  private LearnsetExtractor() {}

  public static List<LevelUpEntry> canonicalLevelUp(String pokemonId, int introducedGeneration,
      List<PokeApiPayloads.SourceMove> moves) {
    Map<String, LevelUpEntry> entries = new LinkedHashMap<>();
    for (var move : moves) {
      for (int generation = 1; generation <= VERSION_GROUPS.size(); generation++) {
        if (introducedGeneration > generation) continue;
        var source = VERSION_GROUPS.get(generation - 1);
        for (var detail : move.details()) {
          if (!"level-up".equals(detail.method()) || detail.level() < 1 || !source.equals(detail.versionGroup())) continue;
          var entry = new LevelUpEntry(pokemonId, move.move(), generation, detail.level());
          entries.put(pokemonId + ":" + move.move() + ":" + generation + ":" + detail.level(), entry);
        }
      }
    }
    return new ArrayList<>(entries.values());
  }
}
