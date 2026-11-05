package es.pokemonuniverse.application.auth;

/** Datos ya normalizados y validados; {@code identifier} es un email (con {@code @}) o un nombre de usuario. */
public record LoginCommand(String identifier, String password) {}
