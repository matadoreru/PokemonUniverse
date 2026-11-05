package es.pokemonuniverse.adapters.out.mail;

import es.pokemonuniverse.application.mail.MailMessage;
import es.pokemonuniverse.application.mail.MailSender;
import es.pokemonuniverse.config.MailConfig;
import io.micronaut.context.annotation.Requires;
import jakarta.inject.Singleton;
import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.nio.charset.StandardCharsets;
import java.util.Properties;

/** Envío por SMTP genérico (Resend en PRO, Mailpit en local). */
@Singleton
@Requires(property = "pu.mail.host", pattern = ".+")
public class SmtpMailSender implements MailSender {

  private final MailConfig config;
  private final Session session;

  public SmtpMailSender(MailConfig config) {
    this.config = config;
    var props = new Properties();
    props.put("mail.smtp.host", config.host());
    props.put("mail.smtp.port", String.valueOf(config.port()));
    props.put("mail.smtp.connectiontimeout", "10000");
    props.put("mail.smtp.timeout", "10000");
    props.put("mail.smtp.writetimeout", "10000");
    var auth = config.user() != null && !config.user().isBlank();
    if (config.port() == 465) {
      props.put("mail.smtp.ssl.enable", "true");
    } else if (auth) {
      props.put("mail.smtp.starttls.enable", "true");
    }
    if (auth) {
      props.put("mail.smtp.auth", "true");
      this.session =
          Session.getInstance(
              props,
              new Authenticator() {
                @Override
                protected PasswordAuthentication getPasswordAuthentication() {
                  return new PasswordAuthentication(config.user(), config.password());
                }
              });
    } else {
      this.session = Session.getInstance(props);
    }
  }

  @Override
  public void send(MailMessage message) {
    try {
      var mime = new MimeMessage(session);
      mime.setFrom(new InternetAddress(config.from(), true));
      mime.setRecipients(Message.RecipientType.TO, InternetAddress.parse(message.to(), true));
      mime.setSubject(message.subject(), StandardCharsets.UTF_8.name());
      var alternative = new MimeMultipart("alternative");
      var text = new MimeBodyPart();
      text.setText(message.text(), StandardCharsets.UTF_8.name());
      alternative.addBodyPart(text);
      var html = new MimeBodyPart();
      html.setText(message.html(), StandardCharsets.UTF_8.name(), "html");
      alternative.addBodyPart(html);
      mime.setContent(alternative);
      Transport.send(mime);
    } catch (MessagingException e) {
      throw new IllegalStateException("No se pudo enviar el correo por SMTP", e);
    }
  }
}
