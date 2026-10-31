package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Mapeo mínimo de la tabla "Changelog" de Prisma. Hibernate exige al menos una entidad en el
 * paquete escaneado; las siguientes tareas añaden el resto de columnas y tablas.
 */
@Entity
@Table(name = "Changelog")
public class ChangelogEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "version")
  private String version;

  @Column(name = "title")
  private String title;

  @Column(name = "published")
  private boolean published;

  protected ChangelogEntity() {}

  public String getId() {
    return id;
  }

  public String getVersion() {
    return version;
  }

  public String getTitle() {
    return title;
  }

  public boolean isPublished() {
    return published;
  }
}
