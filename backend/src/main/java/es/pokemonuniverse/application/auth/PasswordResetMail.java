package es.pokemonuniverse.application.auth;

import es.pokemonuniverse.application.mail.MailMessage;

/** Texto del correo de recuperación de contraseña (en español; el enlace caduca a los 30 minutos). */
public final class PasswordResetMail {

  private PasswordResetMail() {}

  public static MailMessage build(String to, String username, String webOrigin, String token) {
    var origin = webOrigin.endsWith("/") ? webOrigin.substring(0, webOrigin.length() - 1) : webOrigin;
    var link = origin + "/auth/nueva-contrasena?token=" + token;
    var subject = "Pon una contraseña nueva en Pokémon Universe";
    var ignore = "Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.";
    var text =
        "Hola, " + username + ":\n\n"
            + "Para poner una contraseña nueva en Pokémon Universe abre este enlace:\n"
            + link + "\n\n"
            + "El enlace caduca en 30 minutos.\n\n"
            + ignore + "\n";
    var html =
        "<!doctype html><html lang=\"es\"><body style=\"font-family:sans-serif;color:#222\">"
            + "<p>Hola, " + escape(username) + ":</p>"
            + "<p>Para poner una contraseña nueva en Pokémon Universe pulsa el botón:</p>"
            + "<p><a href=\"" + escape(link) + "\" style=\"display:inline-block;padding:12px 20px;"
            + "background:#e63946;color:#fff;text-decoration:none;border-radius:6px\">"
            + "Poner contraseña nueva</a></p>"
            + "<p>El enlace caduca en 30 minutos.</p>"
            + "<p>" + ignore + "</p></body></html>";
    return new MailMessage(to, subject, text, html);
  }

  private static String escape(String s) {
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
  }
}
