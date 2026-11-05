package es.pokemonuniverse.config;

import io.micronaut.context.annotation.ConfigurationInject;
import io.micronaut.context.annotation.ConfigurationProperties;
import io.micronaut.core.annotation.Nullable;

/** Correo saliente ({@code pu.mail}). Sin {@code host} no se envía: solo se registra en el log. */
@ConfigurationProperties("pu.mail")
public class MailConfig {

  private final String host;
  private final int port;
  private final String user;
  private final String password;
  private final String from;

  @ConfigurationInject
  public MailConfig(
      @Nullable String host, @Nullable Integer port, @Nullable String user, @Nullable String password,
      @Nullable String from) {
    this.host = host;
    this.port = port == null ? 465 : port;
    this.user = user;
    this.password = password;
    this.from = from == null || from.isBlank() ? "Pokémon Universe <no-responder@matadoreru.com>" : from;
  }

  /** {@code SMTP_HOST}; vacío o ausente desactiva el envío real. */
  public String host() {
    return host;
  }

  /** {@code SMTP_PORT}: 465 es TLS implícito; otro puerto usa STARTTLS si hay usuario. */
  public int port() {
    return port;
  }

  /** {@code SMTP_USER}; vacío si el servidor no pide autenticación (Mailpit). */
  public String user() {
    return user;
  }

  public String password() {
    return password;
  }

  /** {@code MAIL_FROM}. */
  public String from() {
    return from;
  }
}
