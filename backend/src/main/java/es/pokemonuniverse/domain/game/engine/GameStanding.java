package es.pokemonuniverse.domain.game.engine;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.Map;

/** Clasificación de un jugador; {@code won} es opcional en TS y se omite cuando es nulo. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record GameStanding(
    String playerId,
    int position,
    int points,
    @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Boolean won,
    Map<String, Number> stats) {}
