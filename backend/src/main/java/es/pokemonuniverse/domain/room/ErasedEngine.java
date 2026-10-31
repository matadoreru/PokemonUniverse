package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.CursorChannel;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GameResults;
import io.micronaut.json.tree.JsonNode;
import java.util.Optional;

/**
 * Motor con los tipos borrados ({@code RegisteredGame} de TS, cuyo estado es {@code unknown}). La sala nunca inspecciona
 * el estado: solo lo pasa de vuelta al mismo motor. Los métodos opcionales de {@code MiniGameModule}
 * ({@code handlePresenceChange?}, {@code getCursorChannel?}) se detectan por si el motor los sobrescribe.
 */
public final class ErasedEngine {

  private final GameEngine<Object, Object, Object, Object> engine;
  private final boolean presenceHandler;
  private final boolean cursorChannel;

  @SuppressWarnings("unchecked")
  public ErasedEngine(GameEngine<?, ?, ?, ?> engine) {
    this.engine = (GameEngine<Object, Object, Object, Object>) engine;
    this.presenceHandler = overrides(engine, "handlePresenceChange", Object.class, GameContext.class);
    this.cursorChannel = overrides(engine, "getCursorChannel", Object.class, String.class);
  }

  private static boolean overrides(Object engine, String name, Class<?>... parameters) {
    try {
      return engine.getClass().getMethod(name, parameters).getDeclaringClass() != GameEngine.class;
    } catch (NoSuchMethodException e) {
      throw new IllegalStateException(e);
    }
  }

  public GameManifest manifest() {
    return engine.manifest();
  }

  public Object parseConfig(JsonNode raw) {
    return engine.parseConfig(raw);
  }

  public Object parseAction(JsonNode raw) {
    return engine.parseAction(raw);
  }

  public Optional<String> checkAvailability(Object config, GameContext context) {
    return engine.checkAvailability(config, context);
  }

  public Object createInitialState(Object config, GameContext context) {
    return engine.createInitialState(config, context);
  }

  public Object start(Object state, GameContext context) {
    return engine.start(state, context);
  }

  public GameActionResult<Object> handleAction(Object state, String playerId, Object action, GameContext context) {
    return engine.handleAction(state, playerId, action, context);
  }

  public Object handleTimeout(Object state, GameContext context) {
    return engine.handleTimeout(state, context);
  }

  /** {@code module.handlePresenceChange} existe. */
  public boolean hasPresenceHandler() {
    return presenceHandler;
  }

  public Object handlePresenceChange(Object state, GameContext context) {
    return engine.handlePresenceChange(state, context);
  }

  public Object getPublicState(Object state, GameContext context) {
    return engine.getPublicState(state, context);
  }

  public Object getPlayerState(Object state, String playerId, GameContext context) {
    return engine.getPlayerState(state, playerId, context);
  }

  public GameLifecycle getLifecycle(Object state) {
    return engine.getLifecycle(state);
  }

  public boolean isFinished(Object state) {
    return engine.isFinished(state);
  }

  public GameResults getResults(Object state) {
    return engine.getResults(state);
  }

  /** {@code module.getCursorChannel} existe. */
  public boolean hasCursorChannel() {
    return cursorChannel;
  }

  public Optional<CursorChannel> getCursorChannel(Object state, String playerId) {
    return engine.getCursorChannel(state, playerId);
  }

  public Optional<AssetResolution> resolveAsset(Object state, AssetRequest request, GameContext context) {
    return engine.resolveAsset(state, request, context);
  }
}
