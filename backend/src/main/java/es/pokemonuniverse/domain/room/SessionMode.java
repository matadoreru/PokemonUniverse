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

  /** {@code doubleLastGame}: la última partida da el doble de puntos de sesión (remontada opcional). */
  @Serdeable
  record GameCount(int target, boolean doubleLastGame) implements SessionMode {}

  @Serdeable
  record PointTarget(int target) implements SessionMode {}

  /**
   * Multiplicador de los puntos de sesión de la partida {@code gameNumber} (empieza en 1): 2 en la última de una sesión
   * por número de partidas con «La última partida vale doble»; 1 en el resto.
   */
  static int pointsMultiplier(SessionMode mode, int gameNumber) {
    return mode instanceof GameCount count && count.doubleLastGame() && gameNumber >= count.target() ? 2 : 1;
  }

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
