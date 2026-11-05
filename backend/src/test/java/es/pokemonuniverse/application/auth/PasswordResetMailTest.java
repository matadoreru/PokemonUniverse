package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PasswordResetMailTest {

  private static final String LINK = "https://pu.test/auth/nueva-contrasena?token=TOK";

  @Test
  void linkUsesOriginAndToken() {
    var mail = PasswordResetMail.build("a@x.com", "Ana", "https://pu.test", "TOK");
    assertTrue(mail.text().contains(LINK));
    assertEquals("a@x.com", mail.to());
  }

  @Test
  void trailingSlashOriginHasNoDoubleSlash() {
    var mail = PasswordResetMail.build("a@x.com", "Ana", "https://pu.test/", "TOK");
    assertTrue(mail.text().contains(LINK));
    assertTrue(mail.html().contains("href=\"" + LINK + "\""));
  }

  @Test
  void copyIsSpanish() {
    var mail = PasswordResetMail.build("a@x.com", "<Ana&Co>", "https://pu.test", "TOK");
    assertEquals("Pon una contraseña nueva en Pokémon Universe", mail.subject());
    assertTrue(mail.text().contains("<Ana&Co>"));
    assertTrue(mail.text().contains("30 minutos"));
    assertTrue(mail.text().contains("Si no lo has pedido tú, ignora este correo: tu contraseña no cambia."));
    assertTrue(mail.html().contains("href=\"" + LINK + "\""));
    assertTrue(mail.html().contains("&lt;Ana&amp;Co&gt;"));
    assertTrue(!mail.html().contains("<Ana&Co>"));
  }
}
