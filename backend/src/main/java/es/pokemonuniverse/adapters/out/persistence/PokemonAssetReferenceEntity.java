package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Tabla "PokemonAssetReference" de Prisma, solo las columnas que usa el catálogo de gritos. */
@Entity
@Table(name = "PokemonAssetReference")
public class PokemonAssetReferenceEntity {

  @Id @Column(name = "id") private String id;
  @Column(name = "pokemonId") private String pokemonId;
  @Column(name = "kind") private String kind;
  @Column(name = "url") private String url;
  @Column(name = "isPrimary") private boolean isPrimary;
  @Column(name = "createdAt") private Instant createdAt;
  @Column(name = "updatedAt") private Instant updatedAt;

  protected PokemonAssetReferenceEntity() {}

  /** Fábrica mínima para pruebas y siembra. */
  public static PokemonAssetReferenceEntity create(String id, String pokemonId, String kind, String url,
      boolean isPrimary, Instant updatedAt) {
    var e = new PokemonAssetReferenceEntity();
    e.id = id;
    e.pokemonId = pokemonId;
    e.kind = kind;
    e.url = url;
    e.isPrimary = isPrimary;
    e.createdAt = updatedAt;
    e.updatedAt = updatedAt;
    return e;
  }

  public String getId() { return id; }
  public String getPokemonId() { return pokemonId; }
  public String getKind() { return kind; }
  public String getUrl() { return url; }
  public boolean getIsPrimary() { return isPrimary; }
  public Instant getUpdatedAt() { return updatedAt; }
}
