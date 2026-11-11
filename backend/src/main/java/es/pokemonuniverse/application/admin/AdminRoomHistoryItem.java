package es.pokemonuniverse.application.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * {@code AdminRoomHistoryItem} de {@code shared/admin.ts}; los nulos se emiten explícitos, como Node. {@code status} es el enum
 * de Postgres como texto: sus valores solo documentan el contrato, no se validan al leer.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record AdminRoomHistoryItem(String id, String code, String hostDisplayName, @Nullable String hostUserId,
    int maxPlayers,
    @Schema(type = "string", allowableValues = {"ACTIVE", "CLOSED", "INTERRUPTED"},
        requiredMode = Schema.RequiredMode.REQUIRED)
    String status,
    @Nullable String closeReason, long gamesStarted, String createdAt,
    @Nullable String endedAt) {}
