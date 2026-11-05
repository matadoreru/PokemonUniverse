package es.pokemonuniverse.adapters.out.mail;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.mail.MailMessage;
import es.pokemonuniverse.config.MailConfig;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.io.ByteArrayOutputStream;
import org.junit.jupiter.api.Test;

class SmtpMailSenderTest {

  private static final MailMessage MENSAJE =
      new MailMessage("ana@example.com", "Recupera tu contraseña", "Hola, texto ñ", "<p>Hola, html ñ</p>");

  private static MimeMessage construir(String from) throws Exception {
    var config = new MailConfig("localhost", 1025, null, null, from);
    return new SmtpMailSender(config).construir(MENSAJE);
  }

  @Test
  void fromWithAccentsIsEncodedAsRfc2047() throws Exception {
    var mime = construir("Pokémon Universe <no-responder@matadoreru.com>");
    var cabecera = mime.getHeader("From", null);
    assertEquals("=?UTF-8?Q?Pok=C3=A9mon_Universe?= <no-responder@matadoreru.com>", cabecera);
    var salida = new ByteArrayOutputStream();
    mime.writeTo(salida);
    // Todo el mensaje serializado es ASCII: ninguna cabecera lleva UTF-8 crudo.
    for (var b : salida.toByteArray()) assertTrue(b >= 0, "byte no ASCII en el mensaje");
  }

  @Test
  void fromWithoutPersonalPartStillBuilds() throws Exception {
    var mime = construir("no-responder@matadoreru.com");
    assertEquals("no-responder@matadoreru.com", mime.getHeader("From", null));
  }

  @Test
  void subjectAndBothPartsAreBuilt() throws Exception {
    var mime = construir("Pokémon Universe <no-responder@matadoreru.com>");
    assertEquals("Recupera tu contraseña", mime.getSubject());
    assertTrue(mime.getHeader("Subject", null).startsWith("=?UTF-8?"));
    assertEquals("ana@example.com", mime.getHeader("To", null));
    var multipart = (MimeMultipart) mime.getContent();
    assertTrue(multipart.getContentType().startsWith("multipart/alternative"));
    assertEquals(2, multipart.getCount());
    assertTrue(multipart.getBodyPart(0).isMimeType("text/plain"));
    assertEquals("Hola, texto ñ", multipart.getBodyPart(0).getContent());
    assertTrue(multipart.getBodyPart(1).isMimeType("text/html"));
    assertEquals("<p>Hola, html ñ</p>", multipart.getBodyPart(1).getContent());
  }

  @Test
  void starttlsIsRequiredWhenAuthenticatingOnNon465Port() {
    var props = SmtpMailSender.propiedades(new MailConfig("smtp.resend.com", 587, "resend", "clave", null));
    assertEquals("true", props.getProperty("mail.smtp.starttls.enable"));
    assertEquals("true", props.getProperty("mail.smtp.starttls.required"));
    assertEquals("true", props.getProperty("mail.smtp.auth"));
  }

  @Test
  void port465UsesImplicitTlsAndNoStarttls() {
    var props = SmtpMailSender.propiedades(new MailConfig("smtp.resend.com", 465, "resend", "clave", null));
    assertEquals("true", props.getProperty("mail.smtp.ssl.enable"));
    assertNull(props.getProperty("mail.smtp.starttls.required"));
  }

  @Test
  void noAuthNoStarttls() {
    var props = SmtpMailSender.propiedades(new MailConfig("localhost", 1025, null, null, null));
    assertNull(props.getProperty("mail.smtp.starttls.required"));
    assertFalse(props.containsKey("mail.smtp.auth"));
  }
}
