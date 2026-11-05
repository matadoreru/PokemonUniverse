package es.pokemonuniverse.adapters.out.mail;

import es.pokemonuniverse.config.MailConfig;
import io.micronaut.context.annotation.Context;
import jakarta.annotation.PostConstruct;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Avisa una sola vez al arrancar (bean {@code @Context}, no perezoso) si no hay SMTP configurado. */
@Context
public class MailStartupCheck {

  private static final Logger LOG = LoggerFactory.getLogger(MailStartupCheck.class);

  /** Avisos emitidos por el proceso; lo usan las pruebas para comprobar que el aviso sale en el arranque. */
  static final AtomicInteger WARNINGS = new AtomicInteger();

  private final MailConfig config;

  public MailStartupCheck(MailConfig config) {
    this.config = config;
  }

  @PostConstruct
  void avisar() {
    if (config.host() == null || config.host().isBlank()) {
      WARNINGS.incrementAndGet();
      LOG.warn("Correo no configurado (SMTP_HOST vacío): los correos solo se registran en el log.");
    }
  }
}
