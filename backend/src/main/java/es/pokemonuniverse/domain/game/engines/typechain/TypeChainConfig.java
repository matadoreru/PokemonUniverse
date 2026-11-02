package es.pokemonuniverse.domain.game.engines.typechain;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/** Configuración normalizada ({@code typeChainConfigSchema} de {@code type-chain/config.ts}); el esquema es estricto. */
@Serdeable
public record TypeChainConfig(List<Integer> generations, int turnSeconds) {

  private static final Set<String> KEYS = Set.of("generations", "turnSeconds");

  public TypeChainConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultTypeChainConfig}. */
  public static TypeChainConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new TypeChainConfig(generations, 15);
  }

  /**
   * {@code typeChainConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los enteros
   * admiten {@code 15.0} (JS tiene un único tipo numérico) y rechazan {@code 15.5}.
   */
  public static TypeChainConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Type Chain");
    config.strict(KEYS);
    var generations = config.generations("generations");
    return new TypeChainConfig(generations, config.integer("turnSeconds", 10, 45));
  }
}
