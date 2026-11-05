package es.pokemonuniverse.application.mail;

/** Correo ya redactado: destinatario, asunto y las dos alternativas del cuerpo. */
public record MailMessage(String to, String subject, String text, String html) {}
