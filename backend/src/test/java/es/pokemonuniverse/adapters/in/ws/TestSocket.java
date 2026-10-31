package es.pokemonuniverse.adapters.in.ws;

import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.websocket.CloseReason;
import io.micronaut.websocket.annotation.ClientWebSocket;
import io.micronaut.websocket.annotation.OnClose;
import io.micronaut.websocket.annotation.OnMessage;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;

/** Cliente de prueba: separa acks (con {@code ok}) de pushes y recuerda el cierre. */
@ClientWebSocket("/ws")
abstract class TestSocket implements AutoCloseable {

  static final Duration WAIT = Duration.ofSeconds(10);
  private static final ObjectMapper JSON = ObjectMapper.getDefault();

  final List<JsonNode> received = new java.util.concurrent.CopyOnWriteArrayList<>();
  final Map<String, CompletableFuture<JsonNode>> acks = new ConcurrentHashMap<>();
  final BlockingQueue<JsonNode> idlessAcks = new LinkedBlockingQueue<>();
  final BlockingQueue<JsonNode> pushes = new LinkedBlockingQueue<>();
  final CompletableFuture<CloseReason> closed = new CompletableFuture<>();
  private final AtomicInteger ids = new AtomicInteger();

  @OnMessage
  void onMessage(String text) throws IOException {
    var message = JSON.readValue(text, JsonNode.class);
    received.add(message);
    if (message.get("ok") == null) {
      pushes.add(message);
    } else if (message.get("id") == null) {
      idlessAcks.add(message);
    } else {
      acks.computeIfAbsent(message.get("id").getStringValue(), id -> new CompletableFuture<>()).complete(message);
    }
  }

  @OnClose
  void onClose(CloseReason reason) {
    closed.complete(reason);
  }

  abstract void send(String message);

  JsonNode command(String event, String payload) {
    var id = "c" + ids.incrementAndGet();
    send("{\"id\":\"" + id + "\",\"event\":\"" + event + "\"" + (payload == null ? "" : ",\"payload\":" + payload) + "}");
    return awaitAck(id);
  }

  JsonNode awaitAck(String id) {
    return acks.computeIfAbsent(id, key -> new CompletableFuture<>()).orTimeout(WAIT.toMillis(), TimeUnit.MILLISECONDS)
        .join();
  }

  JsonNode awaitIdlessAck() {
    return poll(idlessAcks);
  }

  /** Primer push de {@code event} cuyo payload cumple {@code predicate}; descarta los anteriores. */
  JsonNode awaitPush(String event, Predicate<JsonNode> predicate) {
    long deadline = System.nanoTime() + WAIT.toNanos();
    while (System.nanoTime() < deadline) {
      JsonNode push;
      try {
        push = pushes.poll(deadline - System.nanoTime(), TimeUnit.NANOSECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new AssertionError(e);
      }
      if (push == null) break;
      if (event.equals(push.get("event").getStringValue()) && predicate.test(push.get("payload"))) {
        return push.get("payload");
      }
    }
    throw new AssertionError("No llegó " + event + "; recibidos: " + received);
  }

  CloseReason awaitClose() {
    return closed.orTimeout(WAIT.toMillis(), TimeUnit.MILLISECONDS).join();
  }

  private static JsonNode poll(BlockingQueue<JsonNode> queue) {
    try {
      var value = queue.poll(WAIT.toMillis(), TimeUnit.MILLISECONDS);
      if (value == null) throw new AssertionError("No llegó el ack");
      return value;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new AssertionError(e);
    }
  }
}
