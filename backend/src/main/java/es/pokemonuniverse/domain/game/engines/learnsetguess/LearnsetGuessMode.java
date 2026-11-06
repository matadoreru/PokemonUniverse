package es.pokemonuniverse.domain.game.engines.learnsetguess;

/**
 * {@code LEARNSET_GUESS_MODES} de {@code learnset-guess/config.ts}: {@code CLASSIC} es el juego de siempre y {@code
 * MANUAL_REVEAL} el modo nuevo (revelación manual: cada fallo enseña más movimientos). Una configuración sin {@code
 * mode} se lee como {@code CLASSIC}.
 */
public enum LearnsetGuessMode { CLASSIC, MANUAL_REVEAL }
