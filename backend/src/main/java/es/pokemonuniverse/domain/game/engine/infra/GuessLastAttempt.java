package es.pokemonuniverse.domain.game.engine.infra;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.serde.annotation.Serdeable;

/** {@code { result: 'CORRECT' | 'INCORRECT'; attemptedAt }}: el último intento de cada jugador. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record GuessLastAttempt(GuessAttemptOutcome result, long attemptedAt) {}
