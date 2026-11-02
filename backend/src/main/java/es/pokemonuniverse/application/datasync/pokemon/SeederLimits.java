package es.pokemonuniverse.application.datasync.pokemon;

import java.util.List;

/**
 * Totales de {@code prisma/seed.ts} que deciden qué se descarga y cuándo una fase está completa. En Node son
 * constantes ({@code LAST_NATIONAL_DEX_NUMBER = 1025}, {@code MIN_REGIONAL_FORM_COUNT = 58}, {@code MIN_MOVE_COUNT =
 * 500}, {@code MIN_LEARNSET_ENTRIES = 5000}, {@code MIN_SPANISH_POKEDEX_ENTRIES = 500}, {@code GENERATION_ENDS}); aquí
 * son configurables para que las pruebas usen el subconjunto grabado. La constante única de Node se separa en un rango
 * ({@code firstNationalDex..lastNationalDex}, que se descarga) y su tamaño ({@link #speciesCount()}, que usan las
 * puertas); en producción el rango es 1..1025 y ambos coinciden con Node.
 */
public record SeederLimits(int firstNationalDex, int lastNationalDex, int minRegionalForms, int minMoves,
    int minLearnsetEntries, int minPokedexEntries, List<Integer> generationEnds) {

  public static final SeederLimits PRODUCTION =
      new SeederLimits(1, 1_025, 58, 500, 5_000, 500, List.of(151, 251, 386, 493, 649, 721, 809, 905, 1_025));

  public SeederLimits {
    if (firstNationalDex < 1 || lastNationalDex < firstNationalDex) {
      throw new IllegalArgumentException("Invalid National Dex range " + firstNationalDex + ".." + lastNationalDex);
    }
    generationEnds = List.copyOf(generationEnds);
  }

  /** Especies por defecto esperadas: el umbral de las fases base, evolución y metadatos. */
  public int speciesCount() {
    return lastNationalDex - firstNationalDex + 1;
  }

  /** {@code generationFor}: la primera generación cuyo final no es menor que el número. */
  public int generationFor(int number) {
    for (int index = 0; index < generationEnds.size(); index++) {
      if (number <= generationEnds.get(index)) return index + 1;
    }
    throw new IllegalStateException("No generation for National Dex #" + number);
  }
}
