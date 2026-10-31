package es.pokemonuniverse.application.auth;

/** Datos ya normalizados y validados. */
public record LoginCommand(String email, String password) {}
