package es.pokemonuniverse.domain.game.engines.shinyvote;

/**
 * {@code SHINY_VOTE_MODES} de {@code shiny-vote/config.ts}: {@code CLASSIC} es el juego de siempre y {@code SURVIVAL}
 * el modo nuevo (supervivencia: un fallo y fuera, con más candidatos cada pocas rondas). Una configuración sin {@code
 * mode} se lee como {@code CLASSIC}.
 */
public enum ShinyVoteMode { CLASSIC, SURVIVAL }
