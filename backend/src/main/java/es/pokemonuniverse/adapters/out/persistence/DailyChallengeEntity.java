package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import org.hibernate.annotations.ColumnTransformer;

/** Tabla "DailyChallenge": el reto de un día (juego y catálogo fijado), igual para todas las cuentas. */
@Entity
@Table(name = "DailyChallenge")
public class DailyChallengeEntity {

  /** Día de Madrid. */
  @Id
  @Column(name = "date")
  private LocalDate date;

  @Column(name = "gameId")
  private String gameId;

  /** Lista ordenada de ids del catálogo, como texto JSON (la columna es jsonb). */
  @Column(name = "pokemonIds")
  @ColumnTransformer(read = "\"pokemonIds\"::text", write = "?::jsonb")
  private String pokemonIds;

  @Column(name = "catalogFingerprint")
  private String catalogFingerprint;

  protected DailyChallengeEntity() {}

  public LocalDate getDate() {
    return date;
  }

  public String getGameId() {
    return gameId;
  }

  public String getPokemonIds() {
    return pokemonIds;
  }

  public String getCatalogFingerprint() {
    return catalogFingerprint;
  }
}
