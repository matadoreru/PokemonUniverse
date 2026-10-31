package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Tabla "PokedexEntry" de Prisma. */
@Entity
@Table(name = "PokedexEntry")
public class PokedexEntryEntity {

  @Id @Column(name = "id") private String id;
  @Column(name = "pokemonId") private String pokemonId;
  @Column(name = "text") private String text;
  @Column(name = "language") private String language;
  @Column(name = "generation") private int generation;
  @Column(name = "version") private String version;
  @Column(name = "versionLabel") private String versionLabel;

  protected PokedexEntryEntity() {}

  /** Fábrica mínima para pruebas y siembra. */
  public static PokedexEntryEntity create(String id, String pokemonId, String text, String language, int generation,
      String version, String versionLabel) {
    var e = new PokedexEntryEntity();
    e.id = id;
    e.pokemonId = pokemonId;
    e.text = text;
    e.language = language;
    e.generation = generation;
    e.version = version;
    e.versionLabel = versionLabel;
    return e;
  }

  public String getId() { return id; }
  public String getPokemonId() { return pokemonId; }
  public String getText() { return text; }
  public String getLanguage() { return language; }
  public int getGeneration() { return generation; }
  public String getVersion() { return version; }
  public String getVersionLabel() { return versionLabel; }
}
