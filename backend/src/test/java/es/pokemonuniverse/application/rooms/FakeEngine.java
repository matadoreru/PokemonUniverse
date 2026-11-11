package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Motor mínimo para probar la rotación con más juegos de los que hay portados: se registra bajo el manifiesto real de
 * un juego aún sin motor. Una ronda de 10 s; {@code {type:"SCORE", points}} fija los puntos del jugador y
 * {@code {type:"FINISH"}} o el plazo terminan la partida.
 */
final class FakeEngine implements GameEngine<JsonNode, FakeEngine.State, JsonNode, Map<String, Object>> {

  record State(GamePhase phase, long roundEndsAt, List<String> playerIds, Map<String, Integer> scores) {}

  private final GameManifest manifest;
  /** {@code start} falla (para probar el final de la intro). */
  private final boolean failingStart;

  FakeEngine(GameManifest manifest) {
    this(manifest, false);
  }

  FakeEngine(GameManifest manifest, boolean failingStart) {
    this.manifest = manifest;
    this.failingStart = failingStart;
  }

  @Override
  public GameManifest manifest() {
    return manifest;
  }

  @Override
  public JsonNode parseConfig(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw new ConfigValidationException("Configuración falsa no válida.");
    return raw;
  }

  @Override
  public JsonNode parseAction(JsonNode raw) {
    if (raw == null || !raw.isObject() || raw.get("type") == null) throw new ConfigValidationException("Acción falsa no válida.");
    return raw;
  }

  @Override
  public JsonNode defaultConfig() {
    return JsonNode.createObjectNode(Map.of());
  }

  @Override
  public State createInitialState(JsonNode config, GameContext context) {
    var ids = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    for (var id : ids) scores.put(id, 0);
    return new State(GamePhase.GAME_STARTING, 0, ids, scores);
  }

  @Override
  public State start(State state, GameContext context) {
    if (failingStart) throw new IllegalStateException("start falso que falla");
    return new State(GamePhase.ROUND_ACTIVE, context.now() + 10_000, state.playerIds(), state.scores());
  }

  @Override
  public GameActionResult<State> handleAction(State state, String playerId, JsonNode action, GameContext context) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "La ronda no está activa.");
    var type = action.get("type").getStringValue();
    if (type.equals("FINISH")) return GameActionResult.accept(finished(state));
    var scores = new LinkedHashMap<>(state.scores());
    scores.put(playerId, action.get("points").getIntValue());
    return GameActionResult.accept(new State(state.phase(), state.roundEndsAt(), state.playerIds(), scores));
  }

  private static State finished(State state) {
    return new State(GamePhase.GAME_RESULTS, state.roundEndsAt(), state.playerIds(), state.scores());
  }

  @Override
  public State handleTimeout(State state, GameContext context) {
    return state.phase() == GamePhase.ROUND_ACTIVE ? finished(state) : state;
  }

  @Override
  public Map<String, Object> getPublicState(State state, GameContext context) {
    var view = new LinkedHashMap<String, Object>();
    view.put("phase", state.phase().name());
    view.put("scores", state.scores());
    return view;
  }

  @Override
  public Object getPlayerState(State state, String playerId, GameContext context) {
    return Map.of("score", state.scores().getOrDefault(playerId, 0));
  }

  @Override
  public GameLifecycle getLifecycle(State state) {
    var epoch = "[\"" + state.phase() + "\"," + state.roundEndsAt() + "]";
    return new GameLifecycle(state.phase(), state.phase() == GamePhase.GAME_RESULTS ? null : state.roundEndsAt(), epoch,
        List.of());
  }

  @Override
  public boolean isFinished(State state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(State state) {
    var ordered = new ArrayList<>(state.scores().entrySet());
    ordered.sort(Comparator.comparingInt((Map.Entry<String, Integer> entry) -> -entry.getValue()));
    var standings = new ArrayList<GameStanding>();
    for (int index = 0; index < ordered.size(); index++) {
      int position = index == 0 || !ordered.get(index).getValue().equals(ordered.get(index - 1).getValue())
          ? index + 1 : standings.get(index - 1).position();
      standings.add(new GameStanding(ordered.get(index).getKey(), position, ordered.get(index).getValue(), null,
          Map.of()));
    }
    var leaders = standings.stream().filter(standing -> standing.position() == 1).toList();
    return new GameResults(leaders.size() == 1 ? leaders.getFirst().playerId() : null, standings);
  }
}
