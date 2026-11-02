package es.pokemonuniverse.domain.game.engines.typeduel;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Configuración normalizada ({@code typeDuelConfigSchema} de {@code type-duel/config.ts}). */
@Serdeable
public record TypeDuelConfig(List<Integer> generations, int typeSelectSeconds, int searchSeconds, int rounds) {

  public TypeDuelConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultTypeDuelConfig}. */
  public static TypeDuelConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new TypeDuelConfig(generations, 15, 20, 10);
  }

  /**
   * {@code typeDuelConfigSchema.parse}: objeto obligatorio; las claves desconocidas se ignoran (el esquema no es
   * {@code .strict()}); {@code generations} ({@code pokemonGenerationsSchema}) sin duplicados y ascendentes. Los enteros
   * admiten {@code 10.0} (JS tiene un único tipo numérico) y rechazan {@code 10.5}.
   */
  public static TypeDuelConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Type Duel");
    var generations = config.generations("generations");
    return new TypeDuelConfig(generations,
        config.integer("typeSelectSeconds", 5, 60),
        config.integer("searchSeconds", 10, 60),
        config.integer("rounds", 1, 50));
  }
}
