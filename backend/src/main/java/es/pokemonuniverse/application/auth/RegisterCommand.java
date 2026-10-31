package es.pokemonuniverse.application.auth;

/** Datos ya normalizados y validados. */
public record RegisterCommand(String username, String email, String password) {}
