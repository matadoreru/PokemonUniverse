package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.domain.progression.Experience;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Mapeo de la tabla "UserStats" (una fila por usuario registrado, vacía al crearse). */
@Entity
@Table(name = "UserStats")
public class UserStatsEntity {

  @Id
  @Column(name = "userId")
  private String userId;

  @Column(name = "gamesPlayed")
  private int gamesPlayed;

  @Column(name = "gamesWon")
  private int gamesWon;

  @Column(name = "totalPoints")
  private int totalPoints;

  /** Experiencia total (V3); el nivel se deriva con {@link Experience}. */
  @Column(name = "xp")
  private int xp;

  /** Juego de la última partida terminada (V9); {@code null} si no hay ninguna desde la V9. */
  @Column(name = "lastGameId")
  private String lastGameId;

  /** Partidas seguidas terminadas de {@code lastGameId}, esta incluida (V9; logro «Fiel»). */
  @Column(name = "sameGameStreak")
  private int sameGameStreak;

  protected UserStatsEntity() {}

  public UserStatsEntity(String userId) {
    this.userId = userId;
  }

  public String getUserId() {
    return userId;
  }

  public int getGamesPlayed() {
    return gamesPlayed;
  }

  public int getGamesWon() {
    return gamesWon;
  }

  public int getTotalPoints() {
    return totalPoints;
  }

  public int getXp() {
    return xp;
  }

  public String getLastGameId() {
    return lastGameId;
  }

  public int getSameGameStreak() {
    return sameGameStreak;
  }

  /**
   * Cuenta una partida terminada de {@code gameId}, clasificada o no: la racha sigue si es el mismo juego que la
   * anterior y, si no, vuelve a 1.
   */
  public void recordGameOf(String gameId) {
    sameGameStreak = gameId.equals(lastGameId) ? sameGameStreak + 1 : 1;
    lastGameId = gameId;
  }

  /** Suma la experiencia de una partida terminada sin desbordar la columna. */
  public void addXp(int gained) {
    xp = Experience.add(xp, gained);
  }

  /** Partida sin clasificación de victorias (cooperativa): cuenta como jugada, nunca como ganada, y suma puntos. */
  public void addUnrankedGame(int points) {
    gamesPlayed += 1;
    totalPoints += points;
  }

  /** Suma una partida ({@code increment} de Prisma). */
  public void addGame(boolean won, int points) {
    gamesPlayed += 1;
    gamesWon += won ? 1 : 0;
    totalPoints += points;
  }
}
