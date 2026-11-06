package es.pokemonuniverse.config;

import es.pokemonuniverse.domain.room.ChatFilter;
import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

/** Cableado del chat del lobby: carga la lista de palabras filtradas del classpath. */
@Factory
public class ChatBeans {

  private static final String LIST_PATH = "chat/palabras-filtradas.txt";

  /** Si falta el fichero o una línea es inválida, el arranque falla. */
  @Singleton
  ChatFilter chatFilter() {
    try (InputStream in = ChatBeans.class.getClassLoader().getResourceAsStream(LIST_PATH)) {
      if (in == null) {
        throw new IllegalStateException("Falta el recurso " + LIST_PATH);
      }
      return ChatFilter.fromList(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new UncheckedIOException("No se pudo leer " + LIST_PATH, e);
    }
  }
}
