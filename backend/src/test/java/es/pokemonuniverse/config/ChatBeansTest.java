package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.room.ChatFilter;
import org.junit.jupiter.api.Test;

class ChatBeansTest {

  @Test
  void loadsTheRealListAndFiltersOneOfItsWords() {
    ChatFilter filter = new ChatBeans().chatFilter();
    assertEquals("eres un ***", filter.apply("eres un Capullo"));
    assertEquals("hola mundo", filter.apply("hola mundo"));
  }
}
