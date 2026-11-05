package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Tabla "Friendship": una fila por pareja de cuentas, pendiente o aceptada. */
@Entity
@Table(name = "Friendship")
public class FriendshipEntity {

  public static final String PENDING = "PENDING";
  public static final String ACCEPTED = "ACCEPTED";

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "requesterId")
  private String requesterId;

  @Column(name = "addresseeId")
  private String addresseeId;

  /** {@code PENDING} o {@code ACCEPTED} (lo fuerza un CHECK en la tabla). */
  @Column(name = "status")
  private String status;

  @Column(name = "createdAt")
  private Instant createdAt;

  /** {@code null} mientras la solicitud siga pendiente. */
  @Column(name = "acceptedAt")
  private Instant acceptedAt;

  protected FriendshipEntity() {}

  public static FriendshipEntity create(String id, String requesterId, String addresseeId, Instant now) {
    var e = new FriendshipEntity();
    e.id = id;
    e.requesterId = requesterId;
    e.addresseeId = addresseeId;
    e.status = PENDING;
    e.createdAt = now;
    return e;
  }

  public String getId() {
    return id;
  }

  public String getRequesterId() {
    return requesterId;
  }

  public String getAddresseeId() {
    return addresseeId;
  }

  public String getStatus() {
    return status;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getAcceptedAt() {
    return acceptedAt;
  }

  public void accept(Instant now) {
    this.status = ACCEPTED;
    this.acceptedAt = now;
  }
}
