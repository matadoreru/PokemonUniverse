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
        RoomCommandParsers.gameSelectionMode(json("{\"type\":\"RANDOM\",\"gameIds\":[\"a\",\"b\"]}")));
    assertEquals("""
        [
          {
            "code": "custom",
            "path": [
              "gameIds"
            ],
            "message": "Los minijuegos no pueden repetirse."
          }
        ]""", error(() -> RoomCommandParsers.gameSelectionMode(json("{\"type\":\"RANDOM\",\"gameIds\":[\"a\",\"a\"]}"))));
    assertEquals("""
        [
          {
            "origin": "array",
            "code": "too_small",
            "minimum": 3,
            "inclusive": true,
            "path": [
              "gameIds"
            ],
            "message": "Selecciona al menos 3 minijuegos."
          }
        ]""", error(() -> RoomCommandParsers.gameSelectionMode(json("{\"type\":\"VOTE\",\"gameIds\":[\"a\",\"b\"]}"))));
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
