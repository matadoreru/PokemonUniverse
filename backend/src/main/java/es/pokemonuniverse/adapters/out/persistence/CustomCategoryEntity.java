package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.categories.StoredCustomCategory;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Tabla "CustomCategory" de Prisma; {@code updatedAt} no tiene valor por defecto en la BD ({@code @updatedAt}). */
@Entity
@Table(name = "CustomCategory")
public class CustomCategoryEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "userId")
  private String userId;

  @Column(name = "text")
  private String text;

  @Column(name = "normalizedText")
  private String normalizedText;

  @Column(name = "enabled")
  private boolean enabled = true;

  @Column(name = "createdAt")
  private Instant createdAt;

  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected CustomCategoryEntity() {}

  public static CustomCategoryEntity create(String id, String userId, String text, String normalizedText, Instant now) {
    var e = new CustomCategoryEntity();
    e.id = id;
    e.userId = userId;
    e.text = text;
    e.normalizedText = normalizedText;
    e.createdAt = now;
    e.updatedAt = now;
    return e;
  }

  void changeText(String text, String normalizedText) {
    this.text = text;
    this.normalizedText = normalizedText;
  }

  void changeEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  void touch(Instant now) {
    this.updatedAt = now;
  }

  public String getId() { return id; }
  public String getUserId() { return userId; }
  public boolean isEnabled() { return enabled; }

  StoredCustomCategory toStored() {
    return new StoredCustomCategory(id, userId, text, normalizedText, enabled, createdAt, updatedAt);
  }
}
