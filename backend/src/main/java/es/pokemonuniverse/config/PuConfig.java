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
import java.time.DateTimeException;
import java.time.ZoneId;

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

  /**
   * {@code pu.data-sync.*} ({@code DATA_SYNC_*} de Node). Apagado por defecto: mientras Node siga sincronizando la misma
   * BD, Java no programa nada, no lanza sincronizaciones iniciales ni toca las ejecuciones de otro proceso.
   */
  @ConfigurationProperties("data-sync")
  public static class DataSync {
    private final boolean enabled;
    private final int hour;
    private final int minute;
    private final ZoneId zone;

    private final String pokeapiBaseUrl;
    private final String spriteBaseUrl;

    /**
     * {@code pokeapiBaseUrl}: base de PokéAPI ({@code https://pokeapi.co/api/v2}, fija en Node). {@code spriteBaseUrl}:
     * origen desde el que se descargan los sprites cuya URL guardada es {@code https://raw.githubusercontent.com/…}
     * (en producción el mismo; las pruebas lo apuntan a las respuestas grabadas).
     */
    @ConfigurationInject
    public DataSync(boolean enabled, @Min(0) @Max(23) int hour, @Min(0) @Max(59) int minute,
        @NotBlank String timeZone, @NotBlank String pokeapiBaseUrl, @NotBlank String spriteBaseUrl) {
      this.enabled = enabled;
      this.hour = hour;
      this.minute = minute;
      this.pokeapiBaseUrl = pokeapiBaseUrl;
      this.spriteBaseUrl = spriteBaseUrl;
      try {
        this.zone = ZoneId.of(timeZone);
      } catch (DateTimeException e) {
        throw new IllegalArgumentException("pu.data-sync.timeZone is not a valid time zone: " + timeZone, e);
      }
    }

    public boolean enabled() {
      return enabled;
    }

    public int hour() {
      return hour;
    }

    public int minute() {
      return minute;
    }

    public ZoneId zone() {
      return zone;
    }

    public String pokeapiBaseUrl() {
      return pokeapiBaseUrl;
    }

    public String spriteBaseUrl() {
      return spriteBaseUrl;
    }
  }
}
