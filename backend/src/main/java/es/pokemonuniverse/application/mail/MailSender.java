package es.pokemonuniverse.application.mail;

/** Puerto de salida para enviar correo; lo implementan el adaptador SMTP y el de log. */
public interface MailSender {

  void send(MailMessage message);
}
