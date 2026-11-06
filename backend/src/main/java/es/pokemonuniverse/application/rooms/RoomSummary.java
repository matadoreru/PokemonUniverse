package es.pokemonuniverse.application.rooms;

import io.micronaut.core.annotation.Nullable;
import java.util.Set;

/**
 * Lo que una invitación necesita de la sala de quien invita, copiado dentro de su lock.
 *
 * @param memberIds quienes están en la sala (sin los que la dejaron durante una partida)
 * @param seatHolders quienes ocupan plaza: los de {@code memberIds} y los que salieron durante una partida, que pueden
 *     volver aunque esté llena (la misma cuenta que {@code join})
 * @param gameName nombre del minijuego seleccionado; {@code null} si el registro no lo conoce
 * @param inLobby la sala está en el lobby (fase {@code LOBBY}): solo entonces se invita
 */
public record RoomSummary(String code, Set<String> memberIds, Set<String> seatHolders, int maxPlayers,
    @Nullable String gameName, boolean inLobby) {

  public RoomSummary {
    memberIds = Set.copyOf(memberIds);
    seatHolders = Set.copyOf(seatHolders);
  }
}
