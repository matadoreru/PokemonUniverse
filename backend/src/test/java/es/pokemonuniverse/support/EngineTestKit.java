package es.pokemonuniverse.support;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

/**
 * Montaje común de los tests de motor que no son dorados: jugadores {@code p1…pN} («Player N»), contexto en
 * {@code now = 1000} y JSON de entrada y de cable. Los contextos de las doradas siguen en {@code GoldenContexts}.
 */
public final class EngineTestKit {

  /** Instante de partida de los contextos del kit. */
  public static final long NOW = 1000;

  /** El mapper del cable ({@code NON_NULL}, como {@code application.yml}). */
  private static final ObjectMapper WIRE =
      ObjectMapper.create(Map.of("micronaut.serde.serialization.inclusion", "NON_NULL"));

  private EngineTestKit() {}

  public static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  /** Lo que viaja por el cable para {@code value}. */
  public static String wire(Object value) {
    try {
      return WIRE.writeValueAsString(value);
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  /** {@code p1…pN}, llamados «Player 1…N». */
  public static List<GamePlayer> players(int count) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= count; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return list;
  }

  /** Contexto a medio montar con {@code players(players)} y {@link #NOW}; el test añade lo que le falte. */
  public static GameContext.Builder builder(PokemonCatalog catalog, DoubleSupplier random, int players) {
    return GameContext.builder(catalog, random).players(players(players)).now(NOW);
  }

  /** Como {@link #builder(PokemonCatalog, DoubleSupplier, int)} con {@code Mulberry32(seed)}. */
  public static GameContext.Builder builder(PokemonCatalog catalog, long seed, int players) {
    return builder(catalog, new Mulberry32(seed), players);
  }

  /** Catálogo dorado {@code gen1-2} recién cargado y {@code Mulberry32(1)}. */
  public static GameContext.Builder builder(int players) {
    return builder(GoldenCatalogs.load("gen1-2"), 1, players);
  }

  /** {@link #builder(int)} sin nada más. */
  public static GameContext context(int players) {
    return builder(players).build();
  }
}
