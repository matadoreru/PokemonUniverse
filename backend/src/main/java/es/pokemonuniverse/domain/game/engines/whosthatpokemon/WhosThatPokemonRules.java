package es.pokemonuniverse.domain.game.engines.whosthatpokemon;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonHint;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonPlayerStats;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonState;
import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Traducción literal de {@code whos-that-pokemon/rules.ts}. */
public final class WhosThatPokemonRules {

  private static final Pattern IMAGE_PATH = Pattern.compile("\\.(png|webp)$", Pattern.CASE_INSENSITIVE);

  private WhosThatPokemonRules() {}

  /**
   * {@code isUsableWhoPokemonSprite}: URL {@code https} de {@code raw.githubusercontent.com} terminada en
   * {@code .png}/{@code .webp}. El esquema y el host se comparan en minúscula, como los normaliza {@code new URL}; una
   * URL que {@link URI} no admite cuenta como el {@code catch} de TS.
   */
  public static boolean isUsableWhoPokemonSprite(Pokemon pokemon) {
    if (!JsStrings.truthy(pokemon.id()) || !JsStrings.truthy(pokemon.name())
        || !JsStrings.truthy(pokemon.sprite())) return false;
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

  /** {@code buildWhoPokemonHints}: generación, primer tipo y etapa evolutiva o número de tipos; como mucho 3. */
  public static List<WhosThatPokemonHint> buildWhoPokemonHints(Pokemon pokemon) {
    var hints = new ArrayList<WhosThatPokemonHint>();
    hints.add(new WhosThatPokemonHint.Generation(pokemon.generation()));
    hints.add(new WhosThatPokemonHint.Type(pokemon.types().getFirst()));
    if (JsNumbers.truthy(pokemon.evolutionStage()) && JsNumbers.truthy(pokemon.evolutionStageCount())) {
      hints.add(new WhosThatPokemonHint.Evolution(pokemon.evolutionStage(), pokemon.evolutionStageCount()));
    } else {
      hints.add(new WhosThatPokemonHint.TypeCount(pokemon.types().size()));
    }
    if (hints.size() < 3 && JsStrings.truthy(pokemon.legendaryStatus())) {
      hints.add(new WhosThatPokemonHint.Category(pokemon.legendaryStatus()));
    }
    return List.copyOf(hints.subList(0, Math.min(3, hints.size())));
  }

  /** {@code whoPokemonHintSchedule}: {@code Math.round} de JS y de Java redondean igual (mitades hacia +∞). */
  public static List<Long> whoPokemonHintSchedule(long roundStartedAt, int roundSeconds, int hintCount) {
    long duration = roundSeconds * 1_000L;
    var schedule = new ArrayList<Long>();
    for (int index = 0; index < hintCount; index++) {
      schedule.add(roundStartedAt + Math.round((double) (duration * (index + 1)) / (hintCount + 1)));
    }
    return List.copyOf(schedule);
  }

  public static GameResults buildWhoPokemonResults(WhosThatPokemonState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, WhosThatPokemonPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<WhosThatPokemonPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<WhosThatPokemonPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}
