package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Tabla "Pokemon" de Prisma, solo las columnas que usa el catálogo. */
@Entity
@Table(name = "Pokemon")
public class PokemonEntity {

  @Id @Column(name = "id") private String id;
  @Column(name = "nationalDexNumber") private int nationalDexNumber;
  @Column(name = "name") private String name;
  @Column(name = "generation") private int generation;
  @Column(name = "isDefault") private boolean isDefault;
  @Column(name = "sprite") private String sprite;
  @Column(name = "hp") private int hp;
  @Column(name = "attack") private int attack;
  @Column(name = "defense") private int defense;
  @Column(name = "specialAttack") private int specialAttack;
  @Column(name = "specialDefense") private int specialDefense;
  @Column(name = "speed") private int speed;
  @Column(name = "baseStatTotal") private int baseStatTotal;
  @Column(name = "heightDecimeters") private int heightDecimeters;
  @Column(name = "weightHectograms") private int weightHectograms;
  @Column(name = "legendaryStatus") private String legendaryStatus;
  @Column(name = "color") private String color;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "abilities")
  private String[] abilities;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "names")
  private Map<String, Object> names;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "types")
  private String[] types;

  @Column(name = "evolutionStage") private Integer evolutionStage;
  @Column(name = "evolutionStages") private Integer evolutionStages;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "metadata")
  private Map<String, Object> metadata;

  @Column(name = "updatedAt") private Instant updatedAt;

  protected PokemonEntity() {}

  /** Fábrica mínima para pruebas y siembra: estadísticas a cero y sin metadatos. */
  public static PokemonEntity create(String id, int dex, String name, int generation, boolean isDefault,
      String[] abilities, String[] types, Map<String, Object> metadata, Instant now) {
    var e = new PokemonEntity();
    e.id = id;
    e.nationalDexNumber = dex;
    e.name = name;
    e.generation = generation;
    e.isDefault = isDefault;
    e.sprite = "https://sprites/" + id + ".png";
    e.heightDecimeters = 7;
    e.weightHectograms = 69;
    e.legendaryStatus = "NORMAL";
    e.color = "green";
    e.abilities = abilities;
    e.types = types;
    e.metadata = metadata;
    e.updatedAt = now;
    return e;
  }

  public String getId() { return id; }
  public int getNationalDexNumber() { return nationalDexNumber; }
  public String getName() { return name; }
  public int getGeneration() { return generation; }
  public boolean getIsDefault() { return isDefault; }
  public String getSprite() { return sprite; }
  public int getHp() { return hp; }
  public int getAttack() { return attack; }
  public int getDefense() { return defense; }
  public int getSpecialAttack() { return specialAttack; }
  public int getSpecialDefense() { return specialDefense; }
  public int getSpeed() { return speed; }
  public int getBaseStatTotal() { return baseStatTotal; }
  public int getHeightDecimeters() { return heightDecimeters; }
  public int getWeightHectograms() { return weightHectograms; }
  public String getLegendaryStatus() { return legendaryStatus; }
  public String getColor() { return color; }
  public String[] getAbilities() { return abilities; }
  public Map<String, Object> getNames() { return names; }
  public String[] getTypes() { return types; }
  public Integer getEvolutionStage() { return evolutionStage; }
  public Integer getEvolutionStages() { return evolutionStages; }
  public Map<String, Object> getMetadata() { return metadata; }
  public Instant getUpdatedAt() { return updatedAt; }
}
