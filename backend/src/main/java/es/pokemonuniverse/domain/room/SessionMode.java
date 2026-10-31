package es.pokemonuniverse.domain.room;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import io.micronaut.serde.annotation.Serdeable;

/** {@code SessionMode} de {@code room.ts}: unión discriminada por {@code type}. */
@Serdeable
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
  @JsonSubTypes.Type(value = SessionMode.Infinite.class, name = "INFINITE"),
  @JsonSubTypes.Type(value = SessionMode.GameCount.class, name = "GAME_COUNT"),
  @JsonSubTypes.Type(value = SessionMode.PointTarget.class, name = "POINT_TARGET")
})
public sealed interface SessionMode {

  @Serdeable
  record Infinite() implements SessionMode {}

  @Serdeable
  record GameCount(int target) implements SessionMode {}

  @Serdeable
  record PointTarget(int target) implements SessionMode {}

  /** {@code isSessionComplete(mode, gamesPlayed, sessionPoints)}. */
  static boolean isComplete(SessionMode mode, int gamesPlayed, Iterable<Integer> sessionPoints) {
    return switch (mode) {
      case Infinite ignored -> false;
      case GameCount count -> gamesPlayed >= count.target();
      case PointTarget target -> {
        for (int points : sessionPoints) {
          if (points >= target.target()) yield true;
        }
        yield false;
      }
    };
  }
}
