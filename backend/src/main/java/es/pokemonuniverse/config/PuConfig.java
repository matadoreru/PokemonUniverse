package es.pokemonuniverse.config;

import io.micronaut.context.annotation.ConfigurationInject;
import io.micronaut.context.annotation.ConfigurationProperties;
import io.micronaut.context.annotation.Context;
import io.micronaut.context.env.Environment;
import jakarta.validation.Valid;
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

  @ConfigurationInject
  public PuConfig(
      @NotNull @Valid Auth auth,
      @NotBlank String webOrigin,
      boolean rateLimitDisabled,
      @NotBlank String avatarStorageDir,
      String commitSha) {
    this.auth = auth;
    this.webOrigin = webOrigin;
    this.rateLimitDisabled = rateLimitDisabled;
    this.avatarStorageDir = avatarStorageDir;
    this.commitSha = commitSha;
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
