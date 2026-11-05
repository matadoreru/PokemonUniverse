package es.pokemonuniverse.domain.room;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * {@code GameSelectionMode} de {@code room.ts}: los minijuegos de la sesión, en el orden en que se eligieron, y cómo
 * sale el siguiente. {@link Order} los juega en ese orden y vuelve al primero al acabar la lista, {@link Random} sortea
 * entre ellos y {@link Vote} vota entre hasta tres. Un solo juego en {@link Order} es el antiguo minijuego fijo.
 */
@Serdeable
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
  @JsonSubTypes.Type(value = GameSelectionMode.Order.class, name = "ORDER"),
  @JsonSubTypes.Type(value = GameSelectionMode.Random.class, name = "RANDOM"),
  @JsonSubTypes.Type(value = GameSelectionMode.Vote.class, name = "VOTE")
})
public sealed interface GameSelectionMode {

  /** Minijuegos elegidos, sin repetir y en el orden de selección (al menos uno). */
  List<String> gameIds();

  @Serdeable
  record Order(List<String> gameIds) implements GameSelectionMode {
    public Order {
      gameIds = List.copyOf(gameIds);
    }
  }

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

  /** El mismo modo con otra lista de minijuegos. */
  static GameSelectionMode withGameIds(GameSelectionMode mode, List<String> gameIds) {
    return switch (mode) {
      case Order ignored -> new Order(gameIds);
      case Random ignored -> new Random(gameIds);
      case Vote ignored -> new Vote(gameIds);
    };
  }
}
