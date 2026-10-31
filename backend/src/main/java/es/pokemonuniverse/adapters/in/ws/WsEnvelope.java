package es.pokemonuniverse.adapters.in.ws;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;

/**
 * Sobres JSON del transporte {@code /ws}, el equivalente de los {@code emit}/ack de Socket.IO. Los payloads viajan ya
 * convertidos a árbol: así las claves {@code null} de {@code RoomView} se conservan tal cual.
 */
public final class WsEnvelope {

  private WsEnvelope() {}

  /** Mensaje del cliente: {@code {"id", "event", "payload"}}. Sin {@code id} no hay ack (como sin callback en Node). */
  public record ClientMessage(@Nullable String id, String event, @Nullable JsonNode payload) {}

  /** Respuesta a un comando: {@code {id, ok:true, data}} o {@code {id, ok:false, error}}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record AckMessage(@Nullable String id, boolean ok, @Nullable JsonNode data, @Nullable String error) {

    static AckMessage ok(@Nullable String id, JsonNode data) {
      return new AckMessage(id, true, data, null);
    }

    static AckMessage error(@Nullable String id, String error) {
      return new AckMessage(id, false, null, error);
    }
  }

  /** Evento del servidor: {@code {event, payload}}; sin payload ({@code who-is-who:cursors-reset}) se omite. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PushMessage(String event, @Nullable JsonNode payload) {}
}
