package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Tabla "Changelog" de Prisma. {@code content} es un array JSON sin tipar que se valida al leer. */
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

  @Column(name = "date")
  private Instant date;

  @Column(name = "published")
  private boolean published;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "content")
  private List<Object> content;

  @Column(name = "createdAt")
  private Instant createdAt;

  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected ChangelogEntity() {}

  public static ChangelogEntity create(String id, String version, String title, Instant date,
      boolean published, List<Object> content, Instant now) {
    var e = new ChangelogEntity();
    e.id = id;
    e.version = version;
    e.title = title;
    e.date = date;
    e.published = published;
    e.content = content;
    e.createdAt = now;
    e.updatedAt = now;
    return e;
  }

  public String getId() {
    return id;
  }

  public String getVersion() {
    return version;
  }

  public String getTitle() {
    return title;
  }

  public Instant getDate() {
    return date;
  }

  public boolean isPublished() {
    return published;
  }

  public List<Object> getContent() {
    return content;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  /** Cambios de una edición; {@code null} deja el campo como estaba. */
  public void update(String version, String title, Instant date, Boolean published, List<Object> content,
      Instant now) {
    if (version != null) this.version = version;
    if (title != null) this.title = title;
    if (date != null) this.date = date;
    if (published != null) this.published = published;
    if (content != null) this.content = content;
    this.updatedAt = now;
  }
}
