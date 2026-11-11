package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.RoomRole;
import es.pokemonuniverse.domain.room.SessionMode;
import io.micronaut.json.tree.JsonNode;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Mensajes de Zod 4 grabados con {@code safeParse} sobre los esquemas de {@code room.ts}. */
class RoomCommandParsersTest {

  private static String error(Runnable parse) {
    return assertThrows(RoomException.class, parse::run).getMessage();
  }

  @Test
  void roomCodeTrimsAndUppercases() {
    assertEquals("AB2C3D", RoomCommandParsers.roomCode(JsonNode.createStringNode(" ab2c3d ")));
    assertEquals("ABCDEF", RoomCommandParsers.roomCode(JsonNode.createStringNode("\u00a0abcdef\u00a0")));
    assertEquals("ABCDEF", RoomCommandParsers.roomCode(JsonNode.createStringNode("\ufeff\u3000abcdef\u2028\n")));
    assertEquals("""
        [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected string, received number"
          }
        ]""", error(() -> RoomCommandParsers.roomCode(JsonNode.createNumberNode(42))));
  }

  @Test
  void sessionModeDoubleLastGameIsAnOptionalBooleanOfGameCount() {
    assertEquals(new SessionMode.GameCount(5, false),
        RoomCommandParsers.sessionMode(json("{\"type\":\"GAME_COUNT\",\"target\":5}")));
    assertEquals(new SessionMode.GameCount(5, true),
        RoomCommandParsers.sessionMode(json("{\"type\":\"GAME_COUNT\",\"target\":5,\"doubleLastGame\":true}")));
    // Los otros modos no tienen la opción: se descarta como cualquier clave desconocida.
    assertEquals(new SessionMode.PointTarget(50),
        RoomCommandParsers.sessionMode(json("{\"type\":\"POINT_TARGET\",\"target\":50,\"doubleLastGame\":true}")));
    assertEquals(new SessionMode.Infinite(),
        RoomCommandParsers.sessionMode(json("{\"type\":\"INFINITE\",\"doubleLastGame\":true}")));
    assertEquals("""
        [
          {
            "expected": "boolean",
            "code": "invalid_type",
            "path": [
              "doubleLastGame"
            ],
            "message": "Invalid input: expected boolean, received string"
          }
        ]""", error(() -> RoomCommandParsers.sessionMode(
            json("{\"type\":\"GAME_COUNT\",\"target\":5,\"doubleLastGame\":\"yes\"}"))));
  }

  @Test
  void sessionModeBoundsAndDiscriminator() {
    assertEquals(new SessionMode.Infinite(), RoomCommandParsers.sessionMode(json("{\"type\":\"INFINITE\",\"x\":1}")));
    assertEquals(new SessionMode.PointTarget(10_000),
        RoomCommandParsers.sessionMode(json("{\"type\":\"POINT_TARGET\",\"target\":10000}")));
    assertEquals("""
        [
          {
            "origin": "number",
            "code": "too_small",
            "minimum": 1,
            "inclusive": true,
            "path": [
              "target"
            ],
            "message": "Too small: expected number to be >=1"
          }
        ]""", error(() -> RoomCommandParsers.sessionMode(json("{\"type\":\"GAME_COUNT\",\"target\":0}"))));
    assertEquals("""
        [
          {
            "expected": "int",
            "format": "safeint",
            "code": "invalid_type",
            "path": [
              "target"
            ],
            "message": "Invalid input: expected int, received number"
          }
        ]""", error(() -> RoomCommandParsers.sessionMode(json("{\"type\":\"GAME_COUNT\",\"target\":1.5}"))));
    assertEquals("""
        [
          {
            "code": "invalid_union",
            "errors": [],
            "note": "No matching discriminator",
            "discriminator": "type",
            "options": [
              "INFINITE",
              "GAME_COUNT",
              "POINT_TARGET"
            ],
            "path": [
              "type"
            ],
            "message": "Invalid discriminator value. Expected 'INFINITE' | 'GAME_COUNT' | 'POINT_TARGET'"
          }
        ]""", error(() -> RoomCommandParsers.sessionMode(json("{\"type\":\"X\"}"))));
    assertEquals("""
        [
          {
            "code": "invalid_type",
            "expected": "object",
            "path": [],
            "message": "Invalid input: expected object, received null"
          }
        ]""", error(() -> RoomCommandParsers.sessionMode(JsonNode.nullNode())));
  }

  @Test
  void gameSelectionModes() {
    assertEquals(new GameSelectionMode.Random(List.of("a", "b")),
        RoomCommandParsers.gameSelectionMode(json("{\"type\":\"RANDOM\",\"gameIds\":[\"a\",\"b\"]}"), "z"));
    assertEquals(new GameSelectionMode.Order(List.of("b", "a")),
        RoomCommandParsers.gameSelectionMode(json("{\"type\":\"ORDER\",\"gameIds\":[\"b\",\"a\"]}"), "z"));
    // Un solo juego basta en cualquier modo (la votación con menos de dos juegos lanza el que hay).
    assertEquals(new GameSelectionMode.Vote(List.of("a")),
        RoomCommandParsers.gameSelectionMode(json("{\"type\":\"VOTE\",\"gameIds\":[\"a\"]}"), "z"));
    // Cliente antiguo: el minijuego fijo es el orden con solo el juego elegido.
    assertEquals(new GameSelectionMode.Order(List.of("z")),
        RoomCommandParsers.gameSelectionMode(json("{\"type\":\"FIXED\"}"), "z"));
    assertEquals("""
        [
          {
            "code": "custom",
            "path": [
              "gameIds"
            ],
            "message": "Los minijuegos no pueden repetirse."
          }
        ]""", error(() -> RoomCommandParsers.gameSelectionMode(json("{\"type\":\"RANDOM\",\"gameIds\":[\"a\",\"a\"]}"), "z")));
    // La lista puede quedar vacía en el lobby: es empezar la partida lo que exige un juego.
    assertEquals(new GameSelectionMode.Order(List.of()),
        RoomCommandParsers.gameSelectionMode(json("{\"type\":\"ORDER\",\"gameIds\":[]}"), "z"));
  }

  @Test
  void strictSkipVoteRequest() {
    assertEquals("""
        [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "gameInstanceId"
            ],
            "message": "Invalid input: expected string, received number"
          },
          {
            "expected": "boolean",
            "code": "invalid_type",
            "path": [
              "wantsToSkip"
            ],
            "message": "Invalid input: expected boolean, received undefined"
          },
          {
            "code": "unrecognized_keys",
            "keys": [
              "x"
            ],
            "path": [],
            "message": "Unrecognized key: \\"x\\""
          }
        ]""", error(() -> RoomCommandParsers.setGameSkipVoteRequest(json("{\"x\":1,\"gameInstanceId\":5}"))));
  }

  @Test
  void revealNextRequest() {
    var id = "00000000-0000-4000-8000-000000000001";
    assertEquals(new RoomCommandParsers.RevealNextRequest(id, "[\"ROUND_RESULTS\",1]"),
        RoomCommandParsers.revealNextRequest(json("{\"gameInstanceId\":\"" + id + "\",\"actionEpoch\":\"[\\\"ROUND_RESULTS\\\",1]\"}")));
    for (var invalid : List.of("{}", "null", "{\"gameInstanceId\":\"" + id + "\"}",
        "{\"gameInstanceId\":\"x\",\"actionEpoch\":\"e\"}", "{\"gameInstanceId\":\"" + id + "\",\"actionEpoch\":\"\"}",
        "{\"gameInstanceId\":\"" + id + "\",\"actionEpoch\":\"" + "x".repeat(513) + "\"}",
        "{\"gameInstanceId\":\"" + id + "\",\"actionEpoch\":\"e\",\"extra\":1}")) {
      assertEquals("Petición de «Siguiente» no válida.", error(() -> RoomCommandParsers.revealNextRequest(json(invalid))), invalid);
    }
  }

  @Test
  void assignableRoles() {
    assertEquals(RoomRole.CO_HOST, RoomCommandParsers.assignableRole(JsonNode.createStringNode("CO_HOST")));
    assertEquals("""
        [
          {
            "code": "invalid_value",
            "values": [
              "CO_HOST",
              "MEMBER"
            ],
            "path": [],
            "message": "Invalid option: expected one of \\"CO_HOST\\"|\\"MEMBER\\""
          }
        ]""", error(() -> RoomCommandParsers.assignableRole(JsonNode.createStringNode("HOST"))));
  }
}
