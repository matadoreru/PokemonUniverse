package es.pokemonuniverse.domain.game.engines.unowntranslator;

/**
 * {@code UNOWN_TRANSLATOR_MODES} de {@code unown-translator/config.ts}: qué se cifra, el nombre de un Pokémon
 * ({@code CLASSIC}) o el de un movimiento ({@code MOVES}). Una configuración sin {@code mode} se lee como
 * {@code CLASSIC}.
 */
public enum UnownTranslatorMode { CLASSIC, MOVES }
