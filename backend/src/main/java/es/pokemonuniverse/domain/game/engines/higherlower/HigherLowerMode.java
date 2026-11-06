package es.pokemonuniverse.domain.game.engines.higherlower;

/**
 * {@code HIGHER_LOWER_MODES} de {@code higher-lower/config.ts}: {@code CLASSIC} es el juego de siempre y {@code
 * ENDLESS} el modo nuevo (racha infinita: un fallo y fuera, gana la racha más larga). Una configuración sin {@code
 * mode} se lee como {@code CLASSIC}.
 */
public enum HigherLowerMode { CLASSIC, ENDLESS }
