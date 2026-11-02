package es.pokemonuniverse.application.gameconfigs;

import io.micronaut.json.tree.JsonNode;

/** Fila de {@code UserGameConfig}: {@code config} es el JSON guardado tal cual, aunque ya no sea válido. */
public record StoredUserGameConfig(String userId, String gameId, JsonNode config) {}
