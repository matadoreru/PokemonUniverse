package es.pokemonuniverse.domain.game.engines.zoomedpokemon;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonConfig.HintKind;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonConfig.ImageMode;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonHint;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonPlayerStats;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Traducción literal de {@code zoomed-pokemon/rules.ts}. {@code alphaBounds}, {@code localAlphaDensity} y
 * {@code validFocusPoint} (y sus umbrales) ya están portados en
 * {@link es.pokemonuniverse.domain.game.assets.FocusPoints}: los usa el renderizador de imágenes, no el motor.
 */
public final class ZoomedPokemonRules {

  /** {@code ZOOMED_POKEMON_ZOOM_STAGES}: niveles de cámara; el último sigue recortado. */
  public static final List<Double> ZOOM_STAGES = List.of(5.0, 3.5, 2.5, 1.7);
  /** {@code ZOOMED_POKEMON_ZOOM_BONUSES}. */
  public static final List<Integer> ZOOM_BONUSES = List.of(4, 3, 2, 1);

  private static final Pattern IMAGE_PATH = Pattern.compile("\\.(png|webp)$", Pattern.CASE_INSENSITIVE);

  private ZoomedPokemonRules() {}

  /** {@code zoomStageSchedule}: un plazo por etapa tras la primera; {@code Math.round} redondea igual que en JS. */
  public static List<Long> zoomStageSchedule(long roundStartedAt, int roundSeconds) {
    long duration = roundSeconds * 1_000L;
    var schedule = new ArrayList<Long>();
    for (int index = 0; index < ZOOM_STAGES.size() - 1; index++) {
      schedule.add(roundStartedAt + Math.round((double) (duration * (index + 1)) / ZOOM_STAGES.size()));
    }
    return List.copyOf(schedule);
  }

  public static int zoomStageAt(long roundStartedAt, int roundSeconds, long now) {
    return (int) zoomStageSchedule(roundStartedAt, roundSeconds).stream().filter(deadline -> now >= deadline).count();
  }

  private static boolean blank(String value) {
    return value == null || value.isEmpty();
  }

  /**
   * {@code isUsableZoomedSprite}: URL {@code https} de {@code raw.githubusercontent.com} terminada en
   * {@code .png}/{@code .webp}. El esquema y el host se comparan en minúscula, como los normaliza {@code new URL}; una
   * URL que {@link URI} no admite cuenta como el {@code catch} de TS.
   */
  public static boolean isUsableZoomedSprite(Pokemon pokemon) {
    if (blank(pokemon.id()) || blank(pokemon.name()) || blank(pokemon.sprite())) return false;
    try {
      var url = new URI(pokemon.sprite());
      var scheme = url.getScheme();
      var host = url.getHost();
      var path = url.getRawPath();
      return scheme != null && "https".equals(scheme.toLowerCase(Locale.ROOT))
          && host != null && "raw.githubusercontent.com".equals(host.toLowerCase(Locale.ROOT))
          && path != null && IMAGE_PATH.matcher(path).find();
    } catch (URISyntaxException e) {
      return false;
    }
  }

  /** {@code buildZoomedHints}: en el orden de {@code selected}; EVOLUTION y CATEGORY solo si hay dato. */
  public static List<ZoomedPokemonHint> buildZoomedHints(Pokemon pokemon, List<HintKind> selected) {
    var result = new ArrayList<ZoomedPokemonHint>();
    for (var kind : selected) {
      switch (kind) {
        case GENERATION -> result.add(new ZoomedPokemonHint.Generation(pokemon.generation()));
        case TYPE -> result.add(new ZoomedPokemonHint.Type(pokemon.types()));
        case TYPE_COUNT -> result.add(new ZoomedPokemonHint.TypeCount(pokemon.types().size()));
        case EVOLUTION -> {
          if (truthy(pokemon.evolutionStage()) && truthy(pokemon.evolutionStageCount())) {
            result.add(new ZoomedPokemonHint.Evolution(pokemon.evolutionStage(), pokemon.evolutionStageCount()));
          }
        }
        case CATEGORY -> {
          if (!blank(pokemon.legendaryStatus())) result.add(new ZoomedPokemonHint.Category(pokemon.legendaryStatus()));
        }
      }
    }
    return List.copyOf(result);
  }

  private static boolean truthy(Integer value) {
    return value != null && value != 0;
  }

  /** {@code zoomBonusForStage}: el {@code RangeError} de TS es una {@link EngineException} con el mismo mensaje. */
  public static int zoomBonusForStage(int zoomStage) {
    if (zoomStage < 0 || zoomStage >= ZOOM_BONUSES.size()) throw new EngineException("Invalid zoom stage");
    return ZOOM_BONUSES.get(zoomStage);
  }

  public static int zoomedPoints(int playerCount, int solveOrder, int zoomStage) {
    return Scoring.pointsForPosition(playerCount, solveOrder) + zoomBonusForStage(zoomStage);
  }

  public static GameResults buildZoomedPokemonResults(ZoomedPokemonState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, ZoomedPokemonPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<ZoomedPokemonPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<ZoomedPokemonPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparingInt(entry -> -entry.stats().firstPositions())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }

  public static boolean supportsArtwork(ZoomedPokemonConfig config, String pokemonId, Set<String> artworkIds) {
    return config.imageMode() != ImageMode.ARTWORK || artworkIds.contains(pokemonId);
  }
}
