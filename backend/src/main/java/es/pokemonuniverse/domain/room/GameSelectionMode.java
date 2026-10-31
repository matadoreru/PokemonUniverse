package es.pokemonuniverse.domain.room;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** {@code GameSelectionMode} de {@code room.ts}: minijuego fijo, rotación aleatoria o votación. */
@Serdeable
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
  @JsonSubTypes.Type(value = GameSelectionMode.Fixed.class, name = "FIXED"),
  @JsonSubTypes.Type(value = GameSelectionMode.Random.class, name = "RANDOM"),
  @JsonSubTypes.Type(value = GameSelectionMode.Vote.class, name = "VOTE")
})
public sealed interface GameSelectionMode {

  @Serdeable
  record Fixed() implements GameSelectionMode {}

  @Serdeable
  record Random(List<String> gameIds) implements GameSelectionMode {
    public Random {
      gameIds = List.copyOf(gameIds);
    }
  }

  @Serdeable
  record Vote(List<String> gameIds) implements GameSelectionMode {
    public Vote {
      gameIds = List.copyOf(gameIds);
    }
  }

  /** Lista de la rotación; vacía para {@link Fixed}. */
  static List<String> gameIdsOf(GameSelectionMode mode) {
    return switch (mode) {
      case Fixed ignored -> List.of();
      case Random random -> random.gameIds();
      case Vote vote -> vote.gameIds();
    };
  }
}
