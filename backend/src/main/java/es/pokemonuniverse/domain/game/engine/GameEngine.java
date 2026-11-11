package es.pokemonuniverse.domain.game.engine;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import java.util.List;
import java.util.Optional;

/**
 * Motor de un minijuego: traducción literal de {@code MiniGameModule}, antes en {@code contracts.ts}. Es puro y determinista;
 * el tiempo y el azar llegan solo por {@link GameContext}.
 *
 * <p>La entrada cruda ({@link #parseConfig}, {@link #parseAction}) llega como {@link JsonNode} de
 * {@code micronaut-json-core}: un árbol JSON sin acoplamiento al contenedor, permitido en el dominio.
 *
 * @param <C> configuración normalizada
 * @param <S> estado opaco, solo en el servidor
 * @param <A> acción validada
 * @param <P> proyección pública
 */
public interface GameEngine<C, S, A, P> {

  GameManifest manifest();

  /** Valida y normaliza como {@code configSchema.parse}; lanza {@link ConfigValidationException}. */
  C parseConfig(JsonNode raw);

  /**
   * Todos los issues de {@link #parseConfig} con su ruta Zod (el {@code safeParse(raw).error.issues}); vacío si es
   * válida. Ver {@link ConfigReader#collectIssues} para lo que difiere de Zod.
   */
  default List<ConfigIssue> configIssues(JsonNode raw) {
    return ConfigReader.collectIssues(() -> parseConfig(raw));
  }

  /** Valida como {@code actionSchema.parse}; lanza {@link ConfigValidationException}. */
  A parseAction(JsonNode raw);

  C defaultConfig();

  /** Mensaje de por qué no puede arrancar con esta configuración, o vacío. */
  default Optional<String> checkAvailability(C config, GameContext context) {
    return Optional.empty();
  }

  S createInitialState(C config, GameContext context);

  S start(S state, GameContext context);

  GameActionResult<S> handleAction(S state, String playerId, A action, GameContext context);

  S handleTimeout(S state, GameContext context);

  /** Permite avanzar en cuanto cambia el conjunto de presencia de la sala. */
  default S handlePresenceChange(S state, GameContext context) {
    return state;
  }

  P getPublicState(S state, GameContext context);

  Object getPlayerState(S state, String playerId, GameContext context);

  GameLifecycle getLifecycle(S state);

  boolean isFinished(S state);

  GameResults getResults(S state);

  default Optional<CursorChannel> getCursorChannel(S state, String playerId) {
    return Optional.empty();
  }

  default Optional<AssetResolution> resolveAsset(S state, AssetRequest request, GameContext context) {
    return Optional.empty();
  }
}
