package es.pokemonuniverse.domain.pokemon;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.Map;

/** Movimiento del catálogo ({@code Move}, antes en {@code pokemon/types.ts}); {@code names} null se omite del JSON. */
@Serdeable
public record Move(String id, String name, String type, String category, @Nullable Map<String, Object> names) {}
