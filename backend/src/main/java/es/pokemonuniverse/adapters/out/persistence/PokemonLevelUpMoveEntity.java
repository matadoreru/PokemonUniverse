package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;

/** Tabla "PokemonLevelUpMove" de Prisma; la clave primaria son las cuatro columnas ({@code @@id} de Prisma). */
@Entity
@Table(name = "PokemonLevelUpMove")
@IdClass(PokemonLevelUpMoveEntity.Key.class)
public class PokemonLevelUpMoveEntity {

  /** Clave compuesta: mismos nombres y tipos que los campos {@code @Id} de la entidad. */
  public record Key(String pokemonId, String moveId, int referenceGeneration, int level) implements Serializable {
    public Key() {
      this(null, null, 0, 0);
    }
  }

  @Id @Column(name = "pokemonId") private String pokemonId;
  @Id @Column(name = "moveId") private String moveId;
  @Id @Column(name = "referenceGeneration") private int referenceGeneration;
  @Id @Column(name = "level") private int level;

  protected PokemonLevelUpMoveEntity() {}

  public static PokemonLevelUpMoveEntity create(String pokemonId, String moveId, int referenceGeneration, int level) {
    var e = new PokemonLevelUpMoveEntity();
    e.pokemonId = pokemonId;
    e.moveId = moveId;
    e.referenceGeneration = referenceGeneration;
    e.level = level;
    return e;
  }

  public String getPokemonId() { return pokemonId; }
  public String getMoveId() { return moveId; }
  public int getReferenceGeneration() { return referenceGeneration; }
  public int getLevel() { return level; }
}
