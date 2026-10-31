package es.pokemonuniverse.domain.text;

import com.ibm.icu.text.Collator;
import com.ibm.icu.util.ULocale;
import java.util.Comparator;

/**
 * Único punto de colación de texto: traduce {@code localeCompare} sobre nombres (movimientos, Pokémon, jugadores,
 * versiones). Los ids de jugador se comparan con {@code compareTo}, no aquí.
 *
 * <p>Usa ICU4J, la misma biblioteca que Node, con la raíz CLDR ({@code en-US} no añade reglas sobre ella). El
 * {@code java.text.Collator} de la JDK no sirve: trata espacios y guiones como ignorables en el nivel primario y
 * ordena {@code "Thunderbolt"} antes que {@code "Thunder Shock"}, al revés que Node. Como el colador no es seguro entre
 * hilos, se congela una instancia (inmutable y compartible).
 */
public final class Collations {

  private static final Collator NAMES = names(Collator.getInstance(ULocale.ROOT));

  private static final Comparator<String> NAMES_ORDER = NAMES::compare;

  private Collations() {}

  private static Collator names(Collator collator) {
    collator.setStrength(Collator.TERTIARY);
    return collator.freeze();
  }

  /** Colación ICU raíz con fuerza {@code TERTIARY}: acentos y mayúsculas cuentan, como {@code localeCompare}. */
  public static Comparator<String> names() {
    return NAMES_ORDER;
  }
}
