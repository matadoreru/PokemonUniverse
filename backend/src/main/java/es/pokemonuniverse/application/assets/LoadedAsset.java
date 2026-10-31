package es.pokemonuniverse.application.assets;

/** Recurso de ronda listo para servir: bytes y {@code Content-Type}. */
public record LoadedAsset(byte[] body, String contentType) {}
