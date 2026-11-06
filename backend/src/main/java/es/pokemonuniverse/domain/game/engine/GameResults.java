package es.pokemonuniverse.domain.game.engine;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Creator;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * Resultados de una partida: ganador único o {@code null} si hay empate en cabeza. {@code ranked} solo sale cuando es
 * {@code false}: partida sin ganador ni perdedores (Type Duel · Cooperativo), que no cuenta como jugada ni ganada en
 * las estadísticas del perfil (sí da experiencia y suma sus métricas).
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record GameResults(@Nullable String winnerId, List<GameStanding> standings,
    @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Boolean ranked) {

  @Creator
  public GameResults {}

  /** Partida clasificatoria (lo normal): {@code ranked} no sale en el cable. */
  public GameResults(@Nullable String winnerId, List<GameStanding> standings) {
    this(winnerId, standings, null);
  }

  /** Partida sin clasificación de victorias (cooperativa): ni ganador ni derrota. */
  public static GameResults unranked(List<GameStanding> standings) {
    return new GameResults(null, standings, false);
  }

  /** {@code false} solo en las partidas sin clasificación de victorias. */
  public boolean isRanked() {
    return ranked == null || ranked;
  }
}
