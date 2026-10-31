package es.pokemonuniverse.config;

import io.micronaut.context.annotation.ConfigurationInject;
import io.micronaut.context.annotation.ConfigurationProperties;
import io.micronaut.context.annotation.Context;
import io.micronaut.context.env.Environment;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Configuración tipada del servicio (prefijo {@code pu}); validada al arrancar. */
@Context
@ConfigurationProperties("pu")
public class PuConfig {

  private final Auth auth;
  private final String webOrigin;
  private final boolean rateLimitDisabled;
  private final String avatarStorageDir;
  private final String commitSha;
  private final int roomMaxPlayers;
  private final long reconnectGraceMs;

  /** Con los valores por defecto de sala de Node ({@code ROOM_MAX_PLAYERS=8}, {@code RECONNECT_GRACE_MS=30000}). */
  public PuConfig(Auth auth, String webOrigin, boolean rateLimitDisabled, String avatarStorageDir, String commitSha) {
    this(auth, webOrigin, rateLimitDisabled, avatarStorageDir, commitSha, 8, 30_000);
  }

  @ConfigurationInject
  public PuConfig(
      @NotNull @Valid Auth auth,
      @NotBlank String webOrigin,
      boolean rateLimitDisabled,
      @NotBlank String avatarStorageDir,
      String commitSha,
      @Min(2) @Max(100) int roomMaxPlayers,
      @Min(5_000) @Max(300_000) long reconnectGraceMs) {
    this.auth = auth;
    this.webOrigin = webOrigin;
    this.rateLimitDisabled = rateLimitDisabled;
    this.avatarStorageDir = avatarStorageDir;
    this.commitSha = commitSha;
    this.roomMaxPlayers = roomMaxPlayers;
    this.reconnectGraceMs = reconnectGraceMs;
  }

  /** {@code ROOM_MAX_PLAYERS}: capacidad por defecto de una sala nueva (2–100). */
  public int roomMaxPlayers() {
    return roomMaxPlayers;
  }

  /** {@code RECONNECT_GRACE_MS}: gracia de reconexión antes de la salida definitiva (5 s–5 min). */
  public long reconnectGraceMs() {
    return reconnectGraceMs;
  }

  public Auth auth() {
    return auth;
  }

  public String webOrigin() {
    return webOrigin;
  }

  public boolean rateLimitDisabled() {
    return rateLimitDisabled;
  }

  public String avatarStorageDir() {
    return avatarStorageDir;
  }

  public String commitSha() {
    return commitSha;
  }

  /** El límite de peticiones nunca se desactiva en producción. */
  public boolean rateLimitActive(Environment env) {
    return !(rateLimitDisabled && !env.getActiveNames().contains("prod"));
  }

  @ConfigurationProperties("auth")
  public static class Auth {
    private final String secret;
    private final boolean cookieSecure;

    @ConfigurationInject
    public Auth(@NotBlank(message = "pu.auth.secret must not be blank")
        @Size(min = 32, message = "pu.auth.secret must have at least 32 characters")
            String secret, boolean cookieSecure) {
      this.secret = secret;
      this.cookieSecure = cookieSecure;
    }

    public String secret() {
      return secret;
    }

    public boolean cookieSecure() {
      return cookieSecure;
    }
  }
}
