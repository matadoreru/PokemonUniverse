package es.pokemonuniverse.domain.pokemon;

import java.util.regex.Pattern;

/** Traducción literal de {@code isSupportedRegionalFormId} de packages/shared. */
public final class RegionalForms {

  private static final Pattern TOTEM = Pattern.compile("-totem(?:-|$)");
  private static final Pattern REGIONAL = Pattern.compile("-(alola|galar|hisui|paldea)$");
  private static final Pattern TAUROS = Pattern.compile("^tauros-paldea-(combat|blaze|aqua)-breed$");

  private RegionalForms() {}

  public static boolean isSupported(String id) {
    if (TOTEM.matcher(id).find()) return false;
    return REGIONAL.matcher(id).find()
        || TAUROS.matcher(id).find()
        || id.equals("darmanitan-galar-standard")
        || id.equals("basculin-white-striped");
  }
}
