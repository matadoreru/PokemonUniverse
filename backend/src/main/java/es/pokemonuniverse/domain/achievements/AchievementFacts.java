package es.pokemonuniverse.domain.achievements;

import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.progression.Experience;
import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;

/**
 * Hechos de una partida terminada para un jugador registrado, sobre los que se evalúan las condiciones del catálogo.
 * {@code gamesPlayed}, {@code gamesWon} y {@code level} ya incluyen esta partida; {@code winsByGame} son las victorias
 * de la cuenta en cada juego y {@code sameGameStreak} las partidas seguidas que lleva de este juego, esta incluida.
 * {@code endedAt} va en hora de Madrid.
 */
public record AchievementFacts(
    String gameId,
    String mode,
    GameStanding standing,
    List<GameStanding> standings,
    boolean won,
    int gamesPlayed,
    int gamesWon,
    int level,
    Map<String, Integer> winsByGame,
    int sameGameStreak,
    ZonedDateTime endedAt) {

  /** Zona en la que se mide la hora de fin («Búho nocturno»). */
  public static final ZoneId ZONE = ZoneId.of("Europe/Madrid");

  public AchievementFacts {
    standings = List.copyOf(standings);
    winsByGame = Map.copyOf(winsByGame);
  }

  /**
   * Construye los hechos: un {@code mode} ausente cuenta como {@code CLASSIC}, el nivel sale de la experiencia total y
   * la hora de fin pasa a {@code Europe/Madrid}.
   */
  public static AchievementFacts of(String gameId, @Nullable String mode, GameStanding standing, GameResults results,
      boolean won, int gamesPlayed, int gamesWon, int xp, Map<String, Integer> winsByGame, int sameGameStreak,
      Instant endedAt) {
    return new AchievementFacts(gameId, mode == null ? "CLASSIC" : mode, standing, results.standings(), won,
        gamesPlayed, gamesWon, Experience.levelFor(xp), winsByGame, sameGameStreak, endedAt.atZone(ZONE));
  }

  /** Jugadores clasificados en la partida. */
  public int playerCount() {
    return standings.size();
  }

  /** El jugador está en el puesto 1 y al menos otro jugador también. */
  public boolean sharedFirst() {
    return standing.position() == 1
        && standings.stream().anyMatch(s -> s.position() == 1 && !s.playerId().equals(standing.playerId()));
  }

  /** El jugador tiene la mayor posición de la partida y esta es mayor que 1. */
  public boolean lastPlace() {
    int worst = standings.stream().mapToInt(GameStanding::position).max().orElse(0);
    return worst > 1 && standing.position() == worst;
  }

  /**
   * La posición es un ranking individual: no en Pokémon Impostor (la posición es el bando) ni en Type Duel
   * Cooperativo (no hay ganador individual).
   */
  public boolean individualRanking() {
    return !"pokemon-impostor".equals(gameId) && !("type-duel".equals(gameId) && "COOP".equals(mode));
  }

  /** Métrica de esta partida del jugador; 0 si el motor no la emite. */
  public long metric(String key) {
    Number value = standing.stats().get(key);
    return value == null ? 0 : value.longValue();
  }
}
