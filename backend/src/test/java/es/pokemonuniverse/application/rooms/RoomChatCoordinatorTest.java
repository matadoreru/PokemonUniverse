package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.room.ChatFilter;
import es.pokemonuniverse.domain.room.ChatMessage;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.RoomRole;
import io.micronaut.json.tree.JsonNode;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Órdenes del chat del lobby en el coordinador: envío, borrado, silencio, historial y traspaso del Host. */
class RoomChatCoordinatorTest {

  private static final String NO_PERMISSION = "No tienes permiso para realizar esta acción.";

  private static JsonNode text(String value) {
    return JsonNode.createStringNode(value);
  }

  private static JsonNode num(long value) {
    return JsonNode.createNumberNode(value);
  }

  private static String error(Runnable action) {
    return assertThrows(RoomException.class, action::run).getMessage();
  }

  private static boolean mutedInView(RoomTestKit kit, LiveRoom room, String viewer, String id) {
    return kit.manager.view(room, viewer).members().stream().filter(m -> m.id().equals(id)).findFirst()
        .orElseThrow().chatMuted();
  }

  /** Host, Co-host ("co"), y los miembros "ana" y "bea". */
  private static LiveRoom withCoHost(RoomTestKit kit) {
    var room = kit.room(8, guest("host", "Host"), guest("co", "Co"), guest("ana", "Ana"), guest("bea", "Bea"));
    kit.manager.setRoomRole("host", "co", json("\"CO_HOST\""));
    return room;
  }

  @Test
  @DisplayName("a message reaches every connected member, filtered")
  void sendReachesEveryConnectedMemberFiltered() {
    var kit = new RoomTestKit();
    kit.manager.useChatFilter(new ChatFilter(List.of("caca")));
    kit.room(8, guest("host", "Host"), guest("a", "Ana"), guest("b", "Bea"));
    kit.events.clear();
    kit.manager.sendChat("a", text("hola caca"));
    var sent = kit.events.named("room:chat:message");
    assertEquals(3, sent.size());
    var expected = sent.getFirst().payload();
    assertTrue(sent.stream().allMatch(s -> s.payload().equals(expected)));
    var payload = (ChatEvents.Message) expected;
    assertEquals(1, payload.message().seq());
    assertEquals("hola ***", payload.message().text());
    assertEquals("a", payload.message().authorId());
    assertEquals("Ana", payload.message().authorName());
    assertEquals(List.of("host", "a", "b"), sent.stream().map(RecordingEvents.Sent::memberId).toList());
  }

  @Test
  @DisplayName("chat commands fail outside the lobby")
  void chatOutsideLobbyIsRejected() {
    var kit = new RoomTestKit("shiny-vote");
    var room = kit.room(8, guest("host", "Host"), guest("a", "Ana"));
    kit.manager.sendChat("a", text("antes"));
    kit.manager.selectGame("host", "shiny-vote");
    kit.startReady(room, "host");
    var lobbyOnly = "Chat is only available in the lobby";
    assertEquals(lobbyOnly, error(() -> kit.manager.sendChat("a", text("hola"))));
    assertEquals(lobbyOnly, error(() -> kit.manager.deleteChatMessage("host", num(1))));
    assertEquals(lobbyOnly, error(() -> kit.manager.setChatMute("host", "a", JsonNode.createBooleanNode(true))));
  }

  @Test
  @DisplayName("a deletion reaches every member")
  void deleteReachesEveryone() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("a", "Ana"), guest("b", "Bea"));
    kit.manager.sendChat("a", text("hola"));
    kit.events.clear();
    kit.manager.deleteChatMessage("host", num(1));
    var deleted = kit.events.named("room:chat:deleted");
    assertEquals(3, deleted.size());
    assertTrue(deleted.stream().allMatch(s -> s.payload().equals(new ChatEvents.Deleted(room.historyId, 1))));
    assertEquals("Message not found", error(() -> kit.manager.deleteChatMessage("host", num(1))));
  }

  @Test
  @DisplayName("a Co-host deletes and mutes members; a plain member cannot")
  void coHostCanDeleteAndMuteMembers() {
    var kit = new RoomTestKit();
    var room = withCoHost(kit);
    kit.manager.sendChat("ana", text("hola"));
    assertEquals(NO_PERMISSION, error(() -> kit.manager.deleteChatMessage("bea", num(1))));
    assertEquals(NO_PERMISSION, error(() -> kit.manager.setChatMute("bea", "ana", JsonNode.createBooleanNode(true))));
    assertEquals(1, room.chat.history().size());
    kit.manager.deleteChatMessage("co", num(1));
    assertTrue(room.chat.history().isEmpty());
    kit.manager.setChatMute("co", "ana", JsonNode.createBooleanNode(true));
    assertTrue(mutedInView(kit, room, "bea", "ana"));
    kit.manager.setChatMute("co", "ana", JsonNode.createBooleanNode(false));
    assertFalse(mutedInView(kit, room, "bea", "ana"));
  }

  @Test
  @DisplayName("nobody mutes the Host and only the Host mutes a Co-host")
  void coHostCannotMuteHostOrCoHost() {
    var kit = new RoomTestKit();
    var room = withCoHost(kit);
    kit.manager.setRoomRole("host", "bea", json("\"CO_HOST\""));
    var yes = JsonNode.createBooleanNode(true);
    assertEquals(NO_PERMISSION, error(() -> kit.manager.setChatMute("co", "host", yes)));
    assertEquals(NO_PERMISSION, error(() -> kit.manager.setChatMute("co", "bea", yes)));
    assertEquals("Cannot mute yourself", error(() -> kit.manager.setChatMute("co", "co", yes)));
    assertEquals("Cannot mute yourself", error(() -> kit.manager.setChatMute("host", "host", yes)));
    kit.manager.setChatMute("host", "bea", yes);
    assertTrue(room.chat.isMuted("bea"));
    assertFalse(room.chat.isMuted("host"));
  }

  @Test
  @DisplayName("a Co-host cannot delete the Host's messages but can delete other Co-hosts' and members'")
  void coHostCannotDeleteHostMessages() {
    var kit = new RoomTestKit();
    var room = withCoHost(kit);
    kit.manager.setRoomRole("host", "bea", json("\"CO_HOST\""));
    kit.manager.sendChat("host", text("del host"));
    kit.manager.sendChat("bea", text("del cohost"));
    kit.manager.sendChat("ana", text("del miembro"));
    assertEquals(NO_PERMISSION, error(() -> kit.manager.deleteChatMessage("co", num(1))));
    kit.manager.deleteChatMessage("co", num(2));
    kit.manager.deleteChatMessage("co", num(3));
    assertEquals(List.of(1L), room.chat.history().stream().map(ChatMessage::seq).toList());
    kit.manager.sendChat("bea", text("otro"));
    kit.manager.deleteChatMessage("host", num(1));
    kit.manager.deleteChatMessage("host", num(4));
    assertTrue(room.chat.history().isEmpty());
  }

  @Test
  @DisplayName("a mute is broadcast as chatMuted and blocks sending")
  void muteBroadcastsChatMutedAndBlocksSending() {
    var kit = new RoomTestKit();
    kit.room(8, guest("host", "Host"), guest("a", "Ana"));
    kit.events.clear();
    kit.manager.setChatMute("host", "a", JsonNode.createBooleanNode(true));
    var state = kit.events.lastStateFor("host");
    assertTrue(state.members().stream().filter(m -> m.id().equals("a")).findFirst().orElseThrow().chatMuted());
    assertFalse(state.members().stream().filter(m -> m.id().equals("host")).findFirst().orElseThrow().chatMuted());
    assertEquals("You are muted in this chat", error(() -> kit.manager.sendChat("a", text("hola"))));
    kit.manager.setChatMute("host", "a", JsonNode.createBooleanNode(false));
    kit.manager.sendChat("a", text("hola"));
  }

  @Test
  @DisplayName("muting yourself or an unknown player fails")
  void cannotMuteYourselfAndUnknownPlayer() {
    var kit = new RoomTestKit();
    kit.room(8, guest("host", "Host"), guest("a", "Ana"));
    var yes = JsonNode.createBooleanNode(true);
    assertEquals("Cannot mute yourself", error(() -> kit.manager.setChatMute("host", "host", yes)));
    assertEquals("Player not found", error(() -> kit.manager.setChatMute("host", "nadie", yes)));
    assertEquals("Player not found", error(() -> kit.manager.setChatMute("host", null, yes)));
  }

  @Test
  @DisplayName("a mute survives leaving and rejoining")
  void muteSurvivesLeaveAndRejoin() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("a", "Ana"));
    kit.manager.sendChat("a", text("hola"));
    kit.manager.setChatMute("host", "a", JsonNode.createBooleanNode(true));
    assertEquals(1, room.chat.history().size()); // silenciar no borra
    kit.manager.leave("a");
    RoomTestKit.join(kit.manager, guest("a", "Ana"), "socket-a2", room.code);
    assertTrue(mutedInView(kit, room, "host", "a"));
    assertEquals("You are muted in this chat", error(() -> kit.manager.sendChat("a", text("otra vez"))));
  }

  @Test
  @DisplayName("becoming Host clears the mute, manually or by automatic transfer")
  void becomingHostClearsMute() {
    var kit = new RoomTestKit(10_000, UserGameConfigPreferences.NO_OP);
    var room = kit.room(8, guest("host", "Host"), guest("a", "Ana"), guest("b", "Bea"));
    var yes = JsonNode.createBooleanNode(true);
    kit.manager.setChatMute("host", "a", yes);
    kit.manager.transferHost("host", "a");
    assertEquals("a", room.hostId);
    assertFalse(room.chat.isMuted("a"));
    kit.manager.sendChat("a", text("soy host"));

    // El Host anterior es ahora Co-host y el nuevo Host puede silenciarlo; al volver a ser Host, el silencio cae.
    kit.manager.setChatMute("a", "host", yes);
    assertTrue(room.chat.isMuted("host"));
    kit.manager.disconnect("a", "socket-a");
    kit.time.advance(30_000);
    assertEquals("host", room.hostId);
    assertFalse(room.chat.isMuted("host"));
    kit.manager.sendChat("host", text("vuelvo a mandar"));
  }

  @Test
  @DisplayName("the history is sent on join and on restore")
  void historyOnJoinAndOnRestore() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"));
    kit.manager.sendChat("host", text("uno"));
    kit.manager.sendChat("host", text("dos"));
    RoomTestKit.join(kit.manager, guest("a", "Ana"), "socket-a", room.code);
    var joined = kit.events.named("room:chat:history").getLast();
    assertEquals("a", joined.memberId());
    assertEquals("socket-a", joined.connectionId());
    var history = (ChatEvents.History) joined.payload();
    assertEquals(room.historyId, history.roomInstanceId());
    assertEquals(List.of("uno", "dos"), history.messages().stream().map(ChatMessage::text).toList());

    kit.manager.disconnect("a", "socket-a");
    kit.manager.sendChat("host", text("tres"));
    kit.manager.attach(guest("a", "Ana"), "socket-a2");
    var restored = kit.events.named("room:chat:history").getLast();
    assertEquals("socket-a2", restored.connectionId());
    assertEquals(3, ((ChatEvents.History) restored.payload()).messages().size());
  }

  @Test
  @DisplayName("two connections of one player share the send quota")
  void twoConnectionsShareTheQuota() {
    var kit = new RoomTestKit();
    kit.room(8, guest("host", "Host"), guest("a", "Ana"));
    for (int i = 0; i < 25; i++) kit.manager.sendChat("a", text("m" + i));
    kit.manager.attach(guest("a", "Ana"), "socket-a2");
    for (int i = 0; i < 20; i++) kit.manager.sendChat("a", text("n" + i));
    assertEquals("Too many chat messages", error(() -> kit.manager.sendChat("a", text("de más"))));
    kit.time.advance(60_000);
    kit.manager.sendChat("a", text("ya"));
  }

  @Test
  @DisplayName("invalid muted and seq payloads are rejected")
  void invalidMutedAndSeqPayloads() {
    var kit = new RoomTestKit();
    kit.room(8, guest("host", "Host"), guest("a", "Ana"));
    kit.manager.sendChat("a", text("hola"));
    assertEquals("Invalid chat command", error(() -> kit.manager.setChatMute("host", "a", text("true"))));
    assertEquals("Invalid chat command", error(() -> kit.manager.setChatMute("host", "a", null)));
    assertEquals("Invalid chat command", error(() -> kit.manager.setChatMute("host", "a", num(1))));
    assertEquals("Message not found", error(() -> kit.manager.deleteChatMessage("host", text("1"))));
    assertEquals("Message not found", error(() -> kit.manager.deleteChatMessage("host", JsonNode.createNumberNode(1.5))));
    assertEquals("Message not found", error(() -> kit.manager.deleteChatMessage("host", null)));
    assertEquals("Message is empty", error(() -> kit.manager.sendChat("a", num(5))));
    assertEquals("Message is empty", error(() -> kit.manager.sendChat("a", null)));
  }
}
