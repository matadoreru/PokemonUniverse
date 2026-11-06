package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Tabla "PokemonEvolution" de Prisma, solo las columnas que lee el catálogo (y {@code chainId}/{@code updatedAt},
 * obligatorias al insertar). La escribe {@code JpaPokemonCatalogStore.replaceEvolution}.
 */
@Entity
@Table(name = "PokemonEvolution")
public class PokemonEvolutionEntity {

  @Id @Column(name = "id") private String id;
  @Column(name = "chainId") private int chainId;
  @Column(name = "fromPokemonId") private String fromPokemonId;
  @Column(name = "toPokemonId") private String toPokemonId;
  @Column(name = "updatedAt") private Instant updatedAt;

  protected PokemonEvolutionEntity() {}

  /** Fábrica mínima para pruebas. */
  public static PokemonEvolutionEntity create(String id, int chainId, String fromPokemonId, String toPokemonId,
      Instant now) {
    var e = new PokemonEvolutionEntity();
    e.id = id;
    e.chainId = chainId;
    e.fromPokemonId = fromPokemonId;
    e.toPokemonId = toPokemonId;
    e.updatedAt = now;
    return e;
  }

  public String getId() { return id; }
  public int getChainId() { return chainId; }
  public String getFromPokemonId() { return fromPokemonId; }
  public String getToPokemonId() { return toPokemonId; }
  public Instant getUpdatedAt() { return updatedAt; }
}
