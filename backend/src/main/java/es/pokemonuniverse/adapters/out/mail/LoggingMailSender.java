package es.pokemonuniverse.adapters.out.mail;

import es.pokemonuniverse.application.mail.MailMessage;
import es.pokemonuniverse.application.mail.MailSender;
import io.micronaut.context.annotation.Secondary;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Sin SMTP configurado: registra destinatario y contenido en el log en lugar de enviar. */
// Secondary y no @Requires(missingProperty): SMTP_HOST vacío deja la propiedad definida pero sin valor.
@Singleton
@Secondary
public class LoggingMailSender implements MailSender {

  private static final Logger LOG = LoggerFactory.getLogger(LoggingMailSender.class);

  @Override
  public void send(MailMessage message) {
    LOG.info("Correo (no enviado) para {}: {}\n{}", message.to(), message.subject(), message.text());
  }
}
