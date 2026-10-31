package es.pokemonuniverse.domain.pokemon;

import io.micronaut.serde.annotation.Serdeable;

/** Movimiento aprendido por nivel con su {@link Move} resuelto; componentes en el orden de claves de TS. */
@Serdeable
public record ResolvedLevelUpMove(String moveId, int level, Move move) {}
