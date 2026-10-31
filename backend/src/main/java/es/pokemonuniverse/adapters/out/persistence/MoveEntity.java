package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Tabla "Move" de Prisma, solo las columnas que usa el catálogo (y {@code updatedAt}, obligatoria al insertar). */
@Entity
@Table(name = "Move")
public class MoveEntity {

  @Id @Column(name = "id") private String id;
  @Column(name = "name") private String name;
  @Column(name = "type") private String type;
  @Column(name = "category") private String category;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "names")
  private Map<String, Object> names;

  @Column(name = "updatedAt") private Instant updatedAt;

  protected MoveEntity() {}

  /** Fábrica mínima para pruebas y siembra. */
  public static MoveEntity create(String id, String name, String type, String category, Map<String, Object> names,
      Instant now) {
    var e = new MoveEntity();
    e.id = id;
    e.name = name;
    e.type = type;
    e.category = category;
    e.names = names;
    e.updatedAt = now;
    return e;
  }

  public String getId() { return id; }
  public String getName() { return name; }
  public String getType() { return type; }
  public String getCategory() { return category; }
  public Map<String, Object> getNames() { return names; }
  public Instant getUpdatedAt() { return updatedAt; }
}
