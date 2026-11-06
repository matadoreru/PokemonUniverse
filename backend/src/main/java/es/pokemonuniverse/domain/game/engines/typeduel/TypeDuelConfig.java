package es.pokemonuniverse.domain.game.engines.typeduel;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Configuración normalizada ({@code typeDuelConfigSchema} de {@code type-duel/config.ts}). */
@Serdeable
public record TypeDuelConfig(
    List<Integer> generations,
    int typeSelectSeconds,
    int searchSeconds,
    int rounds,
    int coopSeconds,
    TypeDuelMode mode) {

  /** {@code TYPE_DUEL_COOP_SECONDS_RANGE}: duración de la búsqueda de {@code COOP}; se valida en todos los modos. */
  public static final int COOP_SECONDS_MIN = 30;
  public static final int COOP_SECONDS_MAX = 120;
  public static final int DEFAULT_COOP_SECONDS = 60;

  public TypeDuelConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultTypeDuelConfig}. */
  public static TypeDuelConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new TypeDuelConfig(generations, 15, 20, 10, DEFAULT_COOP_SECONDS, TypeDuelMode.CLASSIC);
  }

  /**
   * {@code typeDuelConfigSchema.parse}: objeto obligatorio; las claves desconocidas se ignoran (el esquema no es
   * {@code .strict()}); {@code generations} ({@code pokemonGenerationsSchema}) sin duplicados y ascendentes;
   * {@code coopSeconds} y {@code mode} ausentes toman su valor por defecto. Los enteros admiten {@code 10.0} (JS tiene
   * un único tipo numérico) y rechazan {@code 10.5}.
   */
  public static TypeDuelConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Type Duel");
    var generations = config.generations("generations");
    return new TypeDuelConfig(generations,
        config.integer("typeSelectSeconds", 5, 60),
        config.integer("searchSeconds", 10, 60),
        config.integer("rounds", 1, 50),
        config.integerOrDefault("coopSeconds", COOP_SECONDS_MIN, COOP_SECONDS_MAX, DEFAULT_COOP_SECONDS),
        config.enumValueOrDefault("mode", TypeDuelMode.class, TypeDuelMode.CLASSIC));
  }
}
