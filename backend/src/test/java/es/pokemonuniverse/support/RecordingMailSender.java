package es.pokemonuniverse.support;

import es.pokemonuniverse.application.mail.MailMessage;
import es.pokemonuniverse.application.mail.MailSender;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import jakarta.inject.Singleton;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;

/**
 * {@link MailSender} falso que guarda los mensajes en vez de enviarlos. Se activa en un test con
 * {@code @Property(name = "test.mail.recording", value = "true")}; sustituye al adaptador SMTP y al de log.
 */
@Singleton
@Requires(property = "test.mail.recording", value = "true")
@Replaces(MailSender.class)
public class RecordingMailSender implements MailSender {

  private static final Pattern TOKEN = Pattern.compile("token=([A-Za-z0-9_-]{43})");

  /** Mensaje enviado y el hilo que lo envió (para comprobar si el envío fue síncrono). */
  public record Sent(MailMessage message, Thread thread) {}

  private final List<Sent> sent = new CopyOnWriteArrayList<>();

  @Override
  public void send(MailMessage message) {
    sent.add(new Sent(message, Thread.currentThread()));
  }

  public List<Sent> sent() {
    return List.copyOf(sent);
  }

  /** Mensajes dirigidos a {@code to}, en orden de envío. */
  public List<MailMessage> sentTo(String to) {
    return sent.stream().map(Sent::message).filter(m -> m.to().equals(to)).toList();
  }

  /** Token del enlace de recuperación que lleva el texto del mensaje. */
  public static String tokenOf(MailMessage message) {
    var m = TOKEN.matcher(message.text());
    if (!m.find()) throw new AssertionError("El correo no lleva enlace con token: " + message.text());
    return m.group(1);
  }

  public void clear() {
    sent.clear();
  }
}
