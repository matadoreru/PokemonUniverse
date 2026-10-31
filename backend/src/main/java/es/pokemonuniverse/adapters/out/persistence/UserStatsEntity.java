package es.pokemonuniverse.adapters.out.persistence;

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
}
