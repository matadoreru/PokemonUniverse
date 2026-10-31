package es.pokemonuniverse.domain.game.engine;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Resultados de una partida: ganador único o {@code null} si hay empate en cabeza. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record GameResults(@Nullable String winnerId, List<GameStanding> standings) {}
