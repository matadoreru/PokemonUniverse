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

  /** Suma la experiencia de una partida terminada sin desbordar la columna. */
  public void addXp(int gained) {
    xp = Experience.add(xp, gained);
  }

  /** Suma una partida ({@code increment} de Prisma). */
  public void addGame(boolean won, int points) {
    gamesPlayed += 1;
    gamesWon += won ? 1 : 0;
    totalPoints += points;
  }
}
