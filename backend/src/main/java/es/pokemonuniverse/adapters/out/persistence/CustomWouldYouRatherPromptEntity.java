package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.wouldyourather.StoredWouldYouRatherPrompt;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Tabla "CustomWouldYouRatherPrompt" de Prisma; {@code updatedAt} no tiene valor por defecto en la BD ({@code @updatedAt}). */
@Entity
@Table(name = "CustomWouldYouRatherPrompt")
public class CustomWouldYouRatherPromptEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "userId")
  private String userId;

  @Column(name = "optionA")
  private String optionA;

  @Column(name = "optionB")
  private String optionB;

  @Column(name = "normalizedKey")
  private String normalizedKey;

  @Column(name = "enabled")
  private boolean enabled = true;

  @Column(name = "createdAt")
  private Instant createdAt;

  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected CustomWouldYouRatherPromptEntity() {}

  public static CustomWouldYouRatherPromptEntity create(String id, String userId, String optionA, String optionB,
      String normalizedKey, Instant now) {
    var e = new CustomWouldYouRatherPromptEntity();
    e.id = id;
    e.userId = userId;
    e.optionA = optionA;
    e.optionB = optionB;
    e.normalizedKey = normalizedKey;
    e.createdAt = now;
    e.updatedAt = now;
    return e;
  }

  void changeOptions(String optionA, String optionB, String normalizedKey) {
    this.optionA = optionA;
    this.optionB = optionB;
    this.normalizedKey = normalizedKey;
  }

  void changeEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  void touch(Instant now) {
    this.updatedAt = now;
  }

  public String getId() { return id; }
  public String getUserId() { return userId; }
  public String getOptionA() { return optionA; }
  public String getOptionB() { return optionB; }
  public String getNormalizedKey() { return normalizedKey; }
  public boolean isEnabled() { return enabled; }

  StoredWouldYouRatherPrompt toStored() {
    return new StoredWouldYouRatherPrompt(id, userId, optionA, optionB, normalizedKey, enabled, createdAt, updatedAt);
  }
}
