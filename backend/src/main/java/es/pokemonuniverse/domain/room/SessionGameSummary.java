package es.pokemonuniverse.domain.room;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;

/**
 * {@code SessionGameSummaryView}: {@code scoringVersion} y {@code rawPoints} son opcionales en TS (historias antiguas)
 * y se omiten cuando faltan. {@code pointsMultiplier} solo sale en una partida que valió doble (2); {@code points} ya
 * lo lleva aplicado y {@code rawPoints} no.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record SessionGameSummary(
    int gameNumber,
    String gameId,
    List<String> winnerIds,
    @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) String scoringVersion,
    Map<String, Integer> points,
    @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, Integer> rawPoints,
    @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer pointsMultiplier) {}
