package es.pokemonuniverse.domain.game.engine;

/** Petición de imagen opaca de una ronda ({@code GameAssetRequest}). */
public record AssetRequest(String assetToken, int roundNumber, String assetId) {}
