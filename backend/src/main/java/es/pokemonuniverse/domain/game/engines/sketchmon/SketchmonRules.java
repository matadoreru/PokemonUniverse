package es.pokemonuniverse.domain.game.engines.sketchmon;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonPlayerStats;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonTypes.SketchmonState;
import java.util.Comparator;

/** Traducción literal de {@code sketchmon/rules.ts}. */
public final class SketchmonRules {

  /** {@code SKETCHMON_DRAWER_POINTS}. */
  public static final int DRAWER_POINTS = 3;

  private SketchmonRules() {}

  /** {@code sketchmonGuesserPoints}: 5, 4, 3 o 2 puntos según el tramo de 20 s en que se acierta. */
  public static int guesserPoints(long elapsedMs) {
    long elapsed = Math.max(0, elapsedMs);
    if (elapsed < 20_000) return 5;
    if (elapsed < 40_000) return 4;
    if (elapsed < 60_000) return 3;
    return 2;
  }

  /**
   * {@code buildSketchmonResults}: puntos, Pokémon adivinados y dibujos adivinados, de mayor a menor. El desempate de
   * TS es {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor (ver el
   * README de motores).
   */
  public static GameResults buildSketchmonResults(SketchmonState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, SketchmonPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<SketchmonPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<SketchmonPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().guessedPokemon())
        .thenComparingInt(entry -> -entry.stats().drawingSuccesses())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}
