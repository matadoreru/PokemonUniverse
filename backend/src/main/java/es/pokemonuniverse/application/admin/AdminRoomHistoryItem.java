package es.pokemonuniverse.application.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/** {@code AdminRoomHistoryItem} de {@code shared/admin.ts}; los nulos se emiten explícitos, como Node. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record AdminRoomHistoryItem(String id, String code, String hostDisplayName, @Nullable String hostUserId,
    int maxPlayers, String status, @Nullable String closeReason, long gamesStarted, String createdAt,
    @Nullable String endedAt) {}
