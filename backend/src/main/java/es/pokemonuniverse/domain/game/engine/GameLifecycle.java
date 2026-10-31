package es.pokemonuniverse.domain.game.engine;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Vocabulario común del ciclo de vida; el transporte no lee el estado opaco del motor. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record GameLifecycle(GamePhase phase, @Nullable Long nextDeadline, String actionEpoch, List<String> spectatorIds) {}
