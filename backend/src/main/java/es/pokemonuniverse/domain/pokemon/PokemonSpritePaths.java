package es.pokemonuniverse.domain.pokemon;

import es.pokemonuniverse.domain.game.engine.infra.JsUrl;

/**
 * Traducción de {@code pokemonSpritePath} de packages/shared: la ruta del proxy de sprites normales
 * ({@code GET /api/pokemon/{id}/sprite}) con el id como un único segmento. La URL original de PokéAPI lleva el número
 * de Pokédex, así que los juegos y el buscador publican esta ruta opaca en su lugar.
 */
public final class PokemonSpritePaths {

  private PokemonSpritePaths() {}

  /** Codifica el id con {@link JsUrl#encodeURIComponent} para dar exactamente lo mismo que {@code encodeURIComponent}. */
  public static String of(String id) {
    return "/api/pokemon/" + JsUrl.encodeURIComponent(id) + "/sprite";
  }
}
