package es.pokemonuniverse.application.admin;

import es.pokemonuniverse.domain.identity.UserRole;
import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Lecturas de la administración sobre las tablas de Prisma ({@code admin/routes.ts}). {@code search} vacío no filtra;
 * si no, es un {@code contains} insensible a mayúsculas como el de Prisma: {@code ILIKE '%' || search || '%'} sin
 * escapar {@code %}, {@code _} ni {@code \} (Prisma 6 tampoco los escapa). Los estados y el rol llegan ya validados.
 */
public interface AdminRecords {

  /** Rol actual de la cuenta, o vacío si ya no existe ({@code requireAdmin} relee el rol en cada petición). */
  Optional<UserRole> roleOf(String userId);

  long countUsers();

  /** Partidas INTERRUPTED con {@code startedAt >= since}. */
  long countInterruptedGamesSince(Instant since);

  long countRooms(String search, @Nullable String status);

  /** {@code roomHistory} por {@code createdAt} descendente, con {@code gamesStarted} = partidas de la sala. */
  List<AdminRoomHistoryItem> rooms(String search, @Nullable String status, int offset, int limit);

  long countGames(String search, @Nullable String status, @Nullable String gameId);

  /** {@code gameHistory} por {@code startedAt} descendente, con los resultados por posición ascendente. */
  List<GameRow> games(String search, @Nullable String status, @Nullable String gameId, int offset, int limit);

  long countUsers(String search, @Nullable String role);

  /** Usuarios por {@code createdAt} descendente con sus estadísticas (0 si no tienen fila). */
  List<AdminUserItem> users(String search, @Nullable String role, int offset, int limit);

  /** Partida sin {@code gameName}: el nombre sale del registro de juegos. */
  record GameRow(String id, String roomCode, String gameId, int playerCount, String status, String startedAt,
      @Nullable String endedAt, List<AdminGameHistoryItem.Participant> participants) {}
}
