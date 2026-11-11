package es.pokemonuniverse.domain.pokemon;

import java.util.Set;
import java.util.regex.Pattern;

/** Traducción literal de {@code isSupportedRegionalFormId}, que antes estaba en {@code packages/shared}. */
public final class RegionalForms {

  private static final Pattern TOTEM = Pattern.compile("-totem(?:-|$)");
  private static final Pattern REGIONAL = Pattern.compile("-(alola|galar|hisui|paldea)$");
  private static final Pattern TAUROS = Pattern.compile("^tauros-paldea-(combat|blaze|aqua)-breed$");

  private static final Pattern REGION = Pattern.compile("-(alola|galar|hisui|paldea)(?:-|$)");

  private RegionalForms() {}

  /**
   * La generación en que salió la región de la forma: Alola 7, Galar e Hisui 8, Paldea 9 (el Basculin de raya blanca
   * es de Hisui). 0 si el id no es de una forma regional.
   */
  public static int regionGeneration(String id) {
    if (id.equals("basculin-white-striped")) return 8;
    var region = REGION.matcher(id);
    if (!region.find()) return 0;
    return switch (region.group(1)) {
      case "alola" -> 7;
      case "paldea" -> 9;
      default -> 8;
    };
  }

  /**
   * Si el Pokémon entra con {@code allowed}: su generación (la de la especie) debe estar, y una forma regional necesita
   * además la generación de su región, para que con 1ª–3ª no salgan las de Alola, Galar, Hisui o Paldea.
   */
  public static boolean inGenerations(Pokemon pokemon, Set<Integer> allowed, boolean includeForms) {
    if (!allowed.contains(pokemon.generation())) return false;
    if (pokemon.isDefault()) return true;
    if (!includeForms) return false;
    int region = regionGeneration(pokemon.id());
    return region == 0 || allowed.contains(region);
  }

  public static boolean isSupported(String id) {
    if (TOTEM.matcher(id).find()) return false;
    return REGIONAL.matcher(id).find()
        || TAUROS.matcher(id).find()
        || id.equals("darmanitan-galar-standard")
        || id.equals("basculin-white-striped");
  }
}
