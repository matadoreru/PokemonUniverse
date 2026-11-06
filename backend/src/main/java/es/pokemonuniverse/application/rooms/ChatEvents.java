package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.room.ChatMessage;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Cargas de los eventos del chat; {@code roomInstanceId} es el de {@code RoomView.roomInstanceId}. */
public final class ChatEvents {

  private ChatEvents() {}

  /** {@code room:chat:history}: lo que había al entrar o al recuperar la sesión. */
  @Serdeable
  public record History(String roomInstanceId, List<ChatMessage> messages) {}

  /** {@code room:chat:message}. */
  @Serdeable
  public record Message(String roomInstanceId, ChatMessage message) {}

  /** {@code room:chat:deleted}. */
  @Serdeable
  public record Deleted(String roomInstanceId, long seq) {}
}
