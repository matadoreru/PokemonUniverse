package es.pokemonuniverse.application.rooms;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** {@link RoomEvents} falso que guarda cada emisión. */
final class RecordingEvents implements RoomEvents {

  record Sent(String memberId, String connectionId, String event, Object payload) {}

  record Kicked(String memberId, String connectionId, String reason) {}

  final List<Sent> sent = new CopyOnWriteArrayList<>();
  final List<Kicked> kicked = new CopyOnWriteArrayList<>();

  @Override
  public void sendToMember(String memberId, String connectionId, String event, Object payload) {
    sent.add(new Sent(memberId, connectionId, event, payload));
  }

  @Override
  public void kick(String memberId, String connectionId, String reason) {
    kicked.add(new Kicked(memberId, connectionId, reason));
  }

  List<Sent> named(String event) {
    return sent.stream().filter(s -> s.event().equals(event)).toList();
  }

  RoomView lastStateFor(String memberId) {
    var states = sent.stream().filter(s -> s.event().equals("room:state") && s.memberId().equals(memberId)).toList();
    return states.isEmpty() ? null : (RoomView) states.getLast().payload();
  }

  void clear() {
    sent.clear();
    kicked.clear();
  }
}
