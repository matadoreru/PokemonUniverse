package es.pokemonuniverse.domain.pokemon;

import java.util.Map;

/** Traducción literal de {@code GENERATION_LEARNSET_SOURCES} de {@code pokemon/types.ts}. */
public final class GenerationLearnsetSources {

  private record Source(String versionGroup, String label) {}

  private static final Map<Integer, Source> SOURCES = Map.of(
      1, new Source("yellow", "Pokémon Yellow"),
      2, new Source("crystal", "Pokémon Crystal"),
      3, new Source("emerald", "Pokémon Emerald"),
      4, new Source("heartgold-soulsilver", "Pokémon HeartGold / SoulSilver"),
      5, new Source("black-2-white-2", "Pokémon Black 2 / White 2"),
      6, new Source("omega-ruby-alpha-sapphire", "Pokémon Omega Ruby / Alpha Sapphire"),
      7, new Source("ultra-sun-ultra-moon", "Pokémon Ultra Sun / Ultra Moon"),
      8, new Source("sword-shield", "Pokémon Sword / Shield"),
      9, new Source("scarlet-violet", "Pokémon Scarlet / Violet"));

  private GenerationLearnsetSources() {}

  public static String versionGroup(int generation) {
    return source(generation).versionGroup();
  }

  public static String label(int generation) {
    return source(generation).label();
  }

  private static Source source(int generation) {
    var source = SOURCES.get(generation);
    if (source == null) throw new IllegalArgumentException("Generación sin fuente de movimientos: " + generation);
    return source;
  }
}
