package es.pokemonuniverse.domain.game.engines.pokedexdistance;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Configuración normalizada ({@code pokedexDistanceConfigSchema} de {@code pokedex-distance/config.ts}). */
@Serdeable
public record PokedexDistanceConfig(List<Integer> generations, int roundSeconds, SelectionVisibility selectionVisibility) {

  /**
   * {@code POKEDEX_DISTANCE_SELECTION_VISIBILITIES}: {@code HIDDEN} oculta las elecciones de los rivales hasta el
   * resultado y admite elecciones repetidas; {@code LIVE} las muestra al momento y bloquea cada Pokémon elegido
   * (permite copiar).
   */
  public enum SelectionVisibility { HIDDEN, LIVE }

  public PokedexDistanceConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultPokedexDistanceConfig}. */
  public static PokedexDistanceConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new PokedexDistanceConfig(generations, 20, SelectionVisibility.HIDDEN);
  }

  /**
   * {@code pokedexDistanceConfigSchema.parse}: objeto obligatorio; las claves desconocidas se ignoran (el esquema no
   * es {@code .strict()}); {@code generations} ({@code pokemonGenerationsSchema}) sin duplicados y ascendentes. Los
   * enteros admiten {@code 10.0} (JS tiene un único tipo numérico) y rechazan {@code 10.5}.
   */
  public static PokedexDistanceConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokédex Distance");
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    var selectionVisibility = config.enumValue("selectionVisibility", SelectionVisibility.class);
    return new PokedexDistanceConfig(generations, roundSeconds, selectionVisibility);
  }
}
