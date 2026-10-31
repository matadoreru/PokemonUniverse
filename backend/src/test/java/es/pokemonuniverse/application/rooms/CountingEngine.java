package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GameResults;
import io.micronaut.json.tree.JsonNode;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

/** Envoltorio que cuenta las proyecciones ({@code vi.spyOn(module, 'getPublicState')}). */
final class CountingEngine implements GameEngine<Object, Object, Object, Object> {

  private final GameEngine<Object, Object, Object, Object> delegate;
  private final AtomicInteger publicCalls;
  private final AtomicInteger privateCalls;

  @SuppressWarnings("unchecked")
  static CountingEngine wrap(GameEngine<?, ?, ?, ?> engine, AtomicInteger publicCalls, AtomicInteger privateCalls) {
    return new CountingEngine((GameEngine<Object, Object, Object, Object>) engine, publicCalls, privateCalls);
  }

  private CountingEngine(GameEngine<Object, Object, Object, Object> delegate, AtomicInteger publicCalls,
      AtomicInteger privateCalls) {
    this.delegate = delegate;
    this.publicCalls = publicCalls;
    this.privateCalls = privateCalls;
  }

  @Override
  public GameManifest manifest() {
    return delegate.manifest();
  }

  @Override
  public Object parseConfig(JsonNode raw) {
    return delegate.parseConfig(raw);
  }

  @Override
  public Object parseAction(JsonNode raw) {
    return delegate.parseAction(raw);
  }

  @Override
  public Object defaultConfig() {
    return delegate.defaultConfig();
  }

  @Override
  public Optional<String> checkAvailability(Object config, GameContext context) {
    return delegate.checkAvailability(config, context);
  }

  @Override
  public Object createInitialState(Object config, GameContext context) {
    return delegate.createInitialState(config, context);
  }

  @Override
  public Object start(Object state, GameContext context) {
    return delegate.start(state, context);
  }

  @Override
  public GameActionResult<Object> handleAction(Object state, String playerId, Object action, GameContext context) {
    return delegate.handleAction(state, playerId, action, context);
  }

  @Override
  public Object handleTimeout(Object state, GameContext context) {
    return delegate.handleTimeout(state, context);
  }

  @Override
  public Object handlePresenceChange(Object state, GameContext context) {
    return delegate.handlePresenceChange(state, context);
  }

  @Override
  public Object getPublicState(Object state, GameContext context) {
    publicCalls.incrementAndGet();
    return delegate.getPublicState(state, context);
  }

  @Override
  public Object getPlayerState(Object state, String playerId, GameContext context) {
    privateCalls.incrementAndGet();
    return delegate.getPlayerState(state, playerId, context);
  }

  @Override
  public GameLifecycle getLifecycle(Object state) {
    return delegate.getLifecycle(state);
  }

  @Override
  public boolean isFinished(Object state) {
    return delegate.isFinished(state);
  }

  @Override
  public GameResults getResults(Object state) {
    return delegate.getResults(state);
  }
}
