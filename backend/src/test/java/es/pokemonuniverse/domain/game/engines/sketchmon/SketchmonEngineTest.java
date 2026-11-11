package es.pokemonuniverse.domain.game.engines.sketchmon;

import static es.pokemonuniverse.support.EngineTestKit.context;
import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonAction;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonDrawOperation;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonGalleryEntry;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonPoint;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonState;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonStroke;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonTool;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque (el exportador no los captura), los
 * límites de 16 384 puntos, 1 024 trazos, 64 lienzos por pila y 12 dibujos de galería (alcanzarlos en una fixture
 * exige decenas de lotes) y los secretos inaccesibles.
 */
class SketchmonEngineTest {

  private final SketchmonEngine engine = new SketchmonEngine(GoldenManifests.of(SketchmonEngine.ID));

  private static SketchmonConfig config(List<Integer> generations) {
    return SketchmonConfig.builder().generations(generations).roundSeconds(60).laps(1).hintsEnabled(false)
        .memoryPreviewEnabled(false).includeForms(false).build();
  }

  /** Primera ronda activa (1000–61000) con dos jugadores. */
  private SketchmonState activeRound(GameContext context) {
    var state = engine.start(engine.createInitialState(config(List.of(1)), context), context);
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    return state;
  }

  private static SketchmonStroke stroke(String id, int points) {
    return new SketchmonStroke(id, SketchmonTool.PENCIL, "#182033", 4,
        Collections.nCopies(points, new SketchmonPoint(0.5, 0.5)));
  }

  private static SketchmonAction.DrawBatch start(String id, int points) {
    return new SketchmonAction.DrawBatch(List.of(new SketchmonDrawOperation.Start(stroke(id, points))));
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("sketchmon", engine.manifest().id());
    assertEquals(2, engine.manifest().minPlayers());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new SketchmonEngine(other));
  }

  @Test
  void parseConfigAcceptsIntegralDoublesAndRejectsOtherTimes() throws IOException {
    var parsed = engine.parseConfig(json("""
        {"generations":[2,1,2],"roundSeconds":90.0,"laps":2.0,"hintsEnabled":true,"memoryPreviewEnabled":false,
         "includeForms":true}"""));
    assertEquals(List.of(1, 2), parsed.generations());
    assertEquals(90, parsed.roundSeconds());
    assertEquals(2, parsed.laps());
    for (var invalid : List.of(
        "{\"generations\":[1],\"roundSeconds\":75,\"laps\":1,\"hintsEnabled\":false,\"memoryPreviewEnabled\":false,"
            + "\"includeForms\":false}",
        "{\"generations\":[1],\"roundSeconds\":90.5,\"laps\":1,\"hintsEnabled\":false,\"memoryPreviewEnabled\":false,"
            + "\"includeForms\":false}",
        "{\"generations\":[1],\"roundSeconds\":60,\"laps\":1,\"hintsEnabled\":false,\"memoryPreviewEnabled\":false,"
            + "\"includeForms\":false,\"extra\":1}")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseConfig(json(invalid)));
    }
  }

  @Test
  void parseActionFollowsTheZodSchema() throws IOException {
    var batch = assertInstanceOf(SketchmonAction.DrawBatch.class, engine.parseAction(json("""
        {"type":"DRAW_BATCH","operations":[
          {"kind":"START","stroke":{"id":"a_B-9","tool":"ERASER","color":"#9a5b3c","width":32.0,
            "points":[{"x":0,"y":1},{"x":0.25,"y":0.75}]}},
          {"kind":"APPEND","strokeId":"a_B-9","points":[{"x":1,"y":0}]}]}""")));
    var start = assertInstanceOf(SketchmonDrawOperation.Start.class, batch.operations().getFirst());
    assertEquals(32, start.stroke().width());
    assertEquals(0.75, start.stroke().points().get(1).y());
    assertInstanceOf(SketchmonAction.UndoStroke.class, engine.parseAction(json("{\"type\":\"UNDO_STROKE\"}")));
    assertInstanceOf(SketchmonAction.RedoStroke.class, engine.parseAction(json("{\"type\":\"REDO_STROKE\"}")));
    assertInstanceOf(SketchmonAction.ClearDrawing.class, engine.parseAction(json("{\"type\":\"CLEAR_DRAWING\"}")));
    var points32 = "[" + String.join(",", Collections.nCopies(32, "{\"x\":0.5,\"y\":0.5}")) + "]";
    var points33 = "[" + String.join(",", Collections.nCopies(33, "{\"x\":0.5,\"y\":0.5}")) + "]";
    engine.parseAction(json(startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "2", points32)));
    var invalid = new ArrayList<>(List.of(
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "2", points33),
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "2", "[]"),
        startAction("\"s\"", "\"pencil\"", "\"#182033\"", "2", points32),
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "2", "[{\"x\":1.5,\"y\":0}]"),
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "2", "[{\"x\":-0.1,\"y\":0}]"),
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "2", "[{\"x\":0,\"y\":0,\"z\":0}]"),
        startAction("\"s\"", "\"PENCIL\"", "\"#18203A\"", "2", points32),
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "1", points32),
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "33", points32),
        startAction("\"s\"", "\"PENCIL\"", "\"#182033\"", "4.5", points32),
        startAction("\"a b\"", "\"PENCIL\"", "\"#182033\"", "2", points32),
        startAction("\"a\\n\"", "\"PENCIL\"", "\"#182033\"", "2", points32),
        startAction("\"\"", "\"PENCIL\"", "\"#182033\"", "2", points32),
        startAction("\"" + "a".repeat(65) + "\"", "\"PENCIL\"", "\"#182033\"", "2", points32),
        "{\"type\":\"DRAW_BATCH\",\"operations\":[]}",
        "{\"type\":\"DRAW_BATCH\",\"operations\":[{\"kind\":\"APPEND\",\"strokeId\":\"s\",\"points\":" + points33
            + "}]}",
        "{\"type\":\"DRAW_BATCH\",\"operations\":[{\"kind\":\"MOVE\",\"strokeId\":\"s\",\"points\":[]}]}",
        "{\"type\":\"UNDO_STROKE\",\"extra\":true}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + "a".repeat(97) + "\"}",
        "{\"type\":\"SHAKE\"}",
        "[]"));
    var nine = "{\"type\":\"DRAW_BATCH\",\"operations\":["
        + String.join(",", Collections.nCopies(9, "{\"kind\":\"APPEND\",\"strokeId\":\"s\",\"points\":[{\"x\":0,"
            + "\"y\":0}]}")) + "]}";
    invalid.add(nine);
    for (var raw : invalid) assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(raw)), raw);
    var guess = engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + "a".repeat(96) + "\"}"));
    assertEquals(96, assertInstanceOf(SketchmonAction.GuessPokemon.class, guess).pokemonId().length());
  }

  private static String startAction(String id, String tool, String color, String width, String points) {
    return "{\"type\":\"DRAW_BATCH\",\"operations\":[{\"kind\":\"START\",\"stroke\":{\"id\":" + id + ",\"tool\":"
        + tool + ",\"color\":" + color + ",\"width\":" + width + ",\"points\":" + points + "}}]}";
  }

  @Test
  void createInitialStateNeedsTwoPlayersAndAPool() {
    var single = context(1);
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(1)), single));
    assertEquals("Se necesitan al menos 2 jugadores.", error.getMessage());
    var pair = context(2);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(9)), pair));
    assertEquals("No hay Pokémon disponibles para esa configuración.", error.getMessage());
  }

  @Test
  void startTwiceAndEarlyResultsFail() {
    var context = context(2);
    var state = activeRound(context);
    var error = assertThrows(EngineException.class, () -> engine.start(state, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  @Test
  void rejectsTheBatchThatExceedsTheCanvasPointLimit() {
    var context = context(2).withNow(2_000);
    var state = activeRound(context);
    var full = new ArrayList<SketchmonStroke>();
    for (int index = 0; index < SketchmonEngine.MAX_POINTS / 32; index++) full.add(stroke("f" + index, 32));
    var almost = new ArrayList<>(full);
    almost.set(0, stroke("f0", 31));
    var nearlyFull = state.toBuilder().strokes(almost).build();
    // 16 383 + 1 cabe; el lote siguiente, con un punto más, no.
    var accepted = engine.handleAction(nearlyFull, state.drawerId(), start("ok", 1), context);
    assertTrue(accepted.accepted());
    var rejected = engine.handleAction(accepted.state(), state.drawerId(), start("ko", 1), context);
    assertFalse(rejected.accepted());
    assertEquals("El dibujo ha alcanzado el límite de puntos. Borra trazos antes de continuar.", rejected.error());
    assertSame(accepted.state(), rejected.state());
    // El recuento se acumula dentro del lote: la primera operación cabría, la segunda no, y no se aplica ninguna.
    var batch = new SketchmonAction.DrawBatch(List.of(new SketchmonDrawOperation.Start(stroke("x", 1)),
        new SketchmonDrawOperation.Start(stroke("y", 1))));
    var partial = engine.handleAction(nearlyFull, state.drawerId(), batch, context);
    assertFalse(partial.accepted());
    assertSame(nearlyFull, partial.state());
  }

  @Test
  void rejectsTheStrokeOverTheStrokeLimit() {
    var context = context(2).withNow(2_000);
    var state = activeRound(context);
    var strokes = new ArrayList<SketchmonStroke>();
    for (int index = 0; index < SketchmonEngine.MAX_STROKES; index++) strokes.add(stroke("s" + index, 1));
    var full = state.toBuilder().strokes(strokes).build();
    var rejected = engine.handleAction(full, state.drawerId(), start("extra", 1), context);
    assertFalse(rejected.accepted());
    assertEquals("El dibujo ha alcanzado el límite de trazos.", rejected.error());
    // Continuar un trazo existente sigue permitido.
    var append = new SketchmonAction.DrawBatch(List.of(
        new SketchmonDrawOperation.Append("s0", List.of(new SketchmonPoint(0.1, 0.1)))));
    var appended = engine.handleAction(full, state.drawerId(), append, context);
    assertTrue(appended.accepted());
    assertEquals(2, appended.state().strokes().getFirst().points().size());
  }

  @Test
  void undoStackKeepsTheLastSixtyFourCanvases() {
    var context = context(2).withNow(2_000);
    var state = activeRound(context);
    for (int index = 0; index < 70; index++) {
      state = engine.handleAction(state, state.drawerId(), start("s" + index, 1), context).state();
    }
    assertEquals(SketchmonEngine.UNDO_LIMIT, state.undoStack().size());
    // El más antiguo que se conserva es el lienzo de 6 trazos (antes de s6).
    assertEquals(6, state.undoStack().getFirst().size());
    for (int index = 0; index < 64; index++) {
      state = engine.handleAction(state, state.drawerId(), new SketchmonAction.UndoStroke(), context).state();
    }
    assertEquals(6, state.strokes().size());
    var noop = engine.handleAction(state, state.drawerId(), new SketchmonAction.UndoStroke(), context);
    assertTrue(noop.accepted());
    assertSame(state, noop.state());
    assertEquals(SketchmonEngine.UNDO_LIMIT, state.redoStack().size());
  }

  @Test
  void galleryKeepsTheLastTwelveDrawings() {
    var context = context(2).withNow(2_000);
    var state = activeRound(context);
    var resolved = engine.handleTimeout(state, context.withNow(62_000));
    var round = Objects.requireNonNull(resolved.lastRound());
    var gallery = new ArrayList<SketchmonGalleryEntry>();
    for (int index = 0; index < SketchmonEngine.GALLERY_LIMIT; index++) {
      gallery.add(SketchmonGalleryEntry.of(round, 100 + index, 1));
    }
    var crowded = state.toBuilder().gallery(gallery).build();
    var next = engine.handleTimeout(crowded, context.withNow(62_000));
    assertEquals(SketchmonEngine.GALLERY_LIMIT, next.gallery().size());
    assertEquals(101, next.gallery().getFirst().roundNumber());
    assertEquals(1, next.gallery().getLast().roundNumber());
    assertEquals(68_000, next.nextTransitionAt());
  }

  @Test
  void unavailableSecretsThrow() {
    var context = context(2).withNow(2_000);
    var state = activeRound(context);
    var lost = state.toBuilder().targetPokemonId("no-existe").build();
    var error = assertThrows(EngineException.class, () -> engine.handleTimeout(lost, context.withNow(62_000)));
    assertEquals("El secreto de Sketchmon ya no está disponible.", error.getMessage());
    var initial = engine.createInitialState(config(List.of(1)), context).toBuilder().poolIds(List.of()).build();
    error = assertThrows(EngineException.class, () -> engine.start(initial, context));
    assertEquals("No hay Pokémon disponibles para Sketchmon.", error.getMessage());
  }
}
