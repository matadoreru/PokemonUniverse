package es.pokemonuniverse.adapters.out.mail;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import es.pokemonuniverse.application.mail.MailSender;
import io.micronaut.context.ApplicationContext;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MailSenderSelectionTest {

  private static Map<String, Object> props(String host) {
    var m = new HashMap<String, Object>();
    m.put("pu.mail.host", host);
    m.put("pu.mail.from", "Test <t@x.com>");
    m.put("micronaut.server.port", -1);
    m.put("pu.mail.port", 1025);
    return m;
  }

  @Test
  void withoutHostLogs() {
    var m = props("");
    try (var ctx = ApplicationContext.builder().properties(m).build().start()) {
      assertInstanceOf(LoggingMailSender.class, ctx.getBean(MailSender.class));
    }
  }

  @Test
  void withHostUsesSmtp() {
    try (var ctx = ApplicationContext.builder().properties(props("localhost")).build().start()) {
      assertInstanceOf(SmtpMailSender.class, ctx.getBean(MailSender.class));
    }
  }

  @Test
  void warnsOnceAtStartupWithoutHostAndNeverWithHost() {
    MailStartupCheck.WARNINGS.set(0);
    // Sin ningún getBean: el aviso debe salir solo por arrancar el contexto.
    try (var ctx = ApplicationContext.builder().properties(props("")).build().start()) {
      assertEquals(1, MailStartupCheck.WARNINGS.get());
    }
    MailStartupCheck.WARNINGS.set(0);
    try (var ctx = ApplicationContext.builder().properties(props("localhost")).build().start()) {
      assertEquals(0, MailStartupCheck.WARNINGS.get());
    }
  }
}
