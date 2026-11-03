package es.pokemonuniverse.domain.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class PokemonSpritePathsTest {

  @Test
  void buildsTheProxyPathLikePokemonSpritePath() {
    assertEquals("/api/pokemon/pikachu/sprite", PokemonSpritePaths.of("pikachu"));
    assertEquals("/api/pokemon/mr-mime/sprite", PokemonSpritePaths.of("mr-mime"));
    // Igual que encodeURIComponent: el id queda en un único segmento.
    assertEquals("/api/pokemon/a%2Fb%20c%C3%A9/sprite", PokemonSpritePaths.of("a/b cé"));
  }
}
