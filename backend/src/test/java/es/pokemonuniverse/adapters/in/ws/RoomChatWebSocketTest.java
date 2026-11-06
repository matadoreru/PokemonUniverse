package es.pokemonuniverse.adapters.in.ws;

import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertError;
import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertOk;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Chat del lobby sobre {@code /ws}: órdenes, eventos a los miembros y el candado de la conexión vigente. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "RoomChatWebSocketTest")
class RoomChatWebSocketTest {

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;

  private WsTestClients clients;

  @BeforeEach
  void openClients() {
    clients = new WsTestClients(client, tokens);
  }

  @AfterEach
  void closeSockets() {
    clients.closeAll();
  }

  private TestSocket connect(String id, String name) {
    return clients.connect(clients.user(id, name));
  }

  private static String createRoom(TestSocket host) {
    return host.command("room:create", "{}").get("data").get("room").get("code").getStringValue();
  }

  @Test
  void sendAckAndMessageReachBothSockets() {
    var host = connect("wc_host_a", "Host");
    var guest = connect("wc_guest_a", "Guest");
    var code = createRoom(host);
    assertOk(guest.command("room:join", "{\"code\":\"" + code + "\"}"));

    assertOk(guest.command("room:chat:send", "{\"text\":\"hola a todos\"}"));
    for (var socket : new TestSocket[] {host, guest}) {
      var push = socket.awaitPush("room:chat:message", payload -> true);
      assertTrue(push.get("roomInstanceId").getStringValue().length() > 0);
      var message = push.get("message");
      assertEquals("hola a todos", message.get("text").getStringValue());
      assertEquals("wc_guest_a", message.get("authorId").getStringValue());
      assertEquals("Guest", message.get("authorName").getStringValue());
      assertEquals(1, message.get("seq").getIntValue());
    }
    assertError("Message is empty", guest.command("room:chat:send", "{\"text\":\"   \"}"));
    assertError("Message is empty", guest.command("room:chat:send", "{}"));
  }

  @Test
  void joinerReceivesHistory() {
    var host = connect("wc_host_b", "Host");
    var code = createRoom(host);
    assertOk(host.command("room:chat:send", "{\"text\":\"primero\"}"));
    assertOk(host.command("room:chat:send", "{\"text\":\"segundo\"}"));

    var late = connect("wc_late_b", "Late");
    assertOk(late.command("room:join", "{\"code\":\"" + code + "\"}"));
    var history = late.awaitPush("room:chat:history", payload -> true);
    var messages = history.get("messages");
    assertEquals(2, messages.size());
    assertEquals("primero", messages.get(0).get("text").getStringValue());
    assertEquals("segundo", messages.get(1).get("text").getStringValue());
  }

  @Test
  void hostDeletesAndMutesOverWs() {
    var host = connect("wc_host_c", "Host");
    var guest = connect("wc_guest_c", "Guest");
    var code = createRoom(host);
    assertOk(guest.command("room:join", "{\"code\":\"" + code + "\"}"));
    assertOk(guest.command("room:chat:send", "{\"text\":\"borra esto\"}"));
    var seq = guest.awaitPush("room:chat:message", payload -> true).get("message").get("seq").getIntValue();

    assertError("No tienes permiso para realizar esta acción.", guest.command("room:chat:delete", "{\"seq\":" + seq + "}"));
    assertOk(host.command("room:chat:delete", "{\"seq\":" + seq + "}"));
    for (var socket : new TestSocket[] {host, guest}) {
      var deleted = socket.awaitPush("room:chat:deleted", payload -> true);
      assertEquals(seq, deleted.get("seq").getIntValue());
    }
    assertError("Message not found", host.command("room:chat:delete", "{\"seq\":" + seq + "}"));

    assertError("Cannot mute yourself", host.command("room:chat:mute", "{\"playerId\":\"wc_host_c\",\"muted\":true}"));
    assertOk(host.command("room:chat:mute", "{\"playerId\":\"wc_guest_c\",\"muted\":true}"));
    var state = guest.awaitPush("room:state", view -> memberMuted(view, "wc_guest_c"));
    assertTrue(memberMuted(state, "wc_guest_c"));
    assertError("You are muted in this chat", guest.command("room:chat:send", "{\"text\":\"hola\"}"));
    assertOk(host.command("room:chat:mute", "{\"playerId\":\"wc_guest_c\",\"muted\":false}"));
    assertOk(guest.command("room:chat:send", "{\"text\":\"ya puedo\"}"));
  }

  @Test
  void notAttachedConnectionGetsTwoTabsError() {
    var host = connect("wc_host_d", "Host");
    createRoom(host);
    var otherTab = connect("wc_host_d", "Host");

    var twoTabs = "Estás jugando en dos pestañas o dispositivos con esta cuenta. Recarga esta página para seguir jugando aquí.";
    assertError(twoTabs, otherTab.command("room:chat:send", "{\"text\":\"hola\"}"));
    assertError(twoTabs, otherTab.command("room:chat:delete", "{\"seq\":1}"));
    assertError(twoTabs, otherTab.command("room:chat:mute", "{\"playerId\":\"x\",\"muted\":true}"));
  }

  private static boolean memberMuted(JsonNode view, String id) {
    for (var member : view.get("members").values()) {
      if (id.equals(member.get("id").getStringValue())) return member.get("chatMuted").getBooleanValue();
    }
    return false;
  }
}
