package es.pokemonuniverse.domain.game.engines.unowntranslator;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownMessage;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownToken;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorMove;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPlayerStats;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPokemon;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorState;
import es.pokemonuniverse.domain.pokemon.LearnsetPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.TreeSet;
import java.util.regex.Pattern;

/** Reglas puras de Traductor Unown (contrapartida de {@code unown-translator/rules.ts}, más las del motor). */
public final class UnownTranslatorRules {

  /** Bloqueo tras un fallo. */
  public static final long COOLDOWN_MS = 3_000;
  /** Tiempo de la revelación entre rondas. */
  public static final long REVEAL_MS = 6_000;
  /** {@code UNOWN_MAX_GUESS_LENGTH}. */
  public static final int MAX_GUESS_LENGTH = 40;
  /** Letras {@code A}-{@code Z} mínimas de un mensaje para entrar en el mazo. */
  public static final int MIN_LETTERS = 3;
  /** {@code UNOWN_GLYPH_COUNT}: un glifo por letra. */
  public static final int GLYPH_COUNT = 26;

  private static final Pattern MARKS = Pattern.compile("\\p{M}+");
  private static final Pattern NOT_ALPHANUMERIC = Pattern.compile("[^A-Z0-9]");

  private UnownTranslatorRules() {}

  /** NFD, sin marcas (Á es A, Ñ es N) y en mayúsculas; el resto de caracteres se queda como está. */
  public static String normalize(String text) {
    var decomposed = Normalizer.normalize(text, Normalizer.Form.NFD);
    return MARKS.matcher(decomposed).replaceAll("").toUpperCase(Locale.ROOT);
  }

  private static String comparable(String text) {
    return NOT_ALPHANUMERIC.matcher(normalize(text)).replaceAll("");
  }

  /** Igualdad sin mayúsculas, acentos, espacios ni signos: solo cuentan {@code A}-{@code Z} y {@code 0}-{@code 9}. */
  public static boolean matches(String guess, String normalizedMessage) {
    return comparable(guess).equals(comparable(normalizedMessage));
  }

  private static boolean cipherable(char c) {
    return c >= 'A' && c <= 'Z';
  }

  /** Número de letras {@code A}-{@code Z} del mensaje normalizado. */
  public static int letterCount(String normalized) {
    int count = 0;
    for (int i = 0; i < normalized.length(); i++) {
      if (cipherable(normalized.charAt(i))) count++;
    }
    return count;
  }

  /** Una pieza por carácter: glifo oculto, glifo ya descubierto (con su letra) o carácter sin cifrar. */
  public static List<UnownToken> tokens(String normalized, List<Integer> key, Collection<String> alphabet) {
    var result = new ArrayList<UnownToken>();
    normalized.codePoints().forEach(codePoint -> {
      var text = new String(Character.toChars(codePoint));
      if (codePoint >= 'A' && codePoint <= 'Z') {
        int glyph = key.get(codePoint - 'A');
        result.add(alphabet.contains(text) ? new UnownToken.Letter(glyph, text) : new UnownToken.Glyph(glyph));
      } else {
        result.add(new UnownToken.Literal(text));
      }
    });
    return List.copyOf(result);
  }

  /** Posiciones con una letra {@code A}-{@code Z} que no está en el alfabeto. */
  public static int hiddenLetters(String normalized, Collection<String> alphabet) {
    int count = 0;
    for (int i = 0; i < normalized.length(); i++) {
      char c = normalized.charAt(i);
      if (cipherable(c) && !alphabet.contains(String.valueOf(c))) count++;
    }
    return count;
  }

  /** Letras distintas que siguen ocultas, en orden alfabético. */
  public static List<String> hiddenDistinctLetters(String normalized, Collection<String> alphabet) {
    var hidden = new TreeSet<String>();
    for (int i = 0; i < normalized.length(); i++) {
      char c = normalized.charAt(i);
      if (cipherable(c) && !alphabet.contains(String.valueOf(c))) hidden.add(String.valueOf(c));
    }
    return List.copyOf(hidden);
  }

  /** Un punto por descifrar y uno más por cada posición que seguía oculta. */
  public static int solvePoints(int hiddenLetters) {
    return 1 + hiddenLetters;
  }

  /** Mazo de {@code CLASSIC}: los Pokémon de las generaciones, sin formas, con tres letras o más; sin barajar. */
  public static List<UnownMessage> pokemonDeck(UnownTranslatorConfig config, PokemonCatalog catalog) {
    var deck = new ArrayList<UnownMessage>();
    for (var pokemon : catalog.forGenerations(config.generations(), false)) {
      var normalized = normalize(pokemon.name());
      if (letterCount(normalized) >= MIN_LETTERS) {
        deck.add(new UnownMessage(pokemon.name(), normalized, new UnownTranslatorPokemon(pokemon.id(), pokemon.name(),
            pokemon.sprite(), pokemon.nationalDexNumber(), pokemon.types()), null));
      }
    }
    return List.copyOf(deck);
  }

  /**
   * Mazo de {@code MOVES}: los movimientos por nivel de cada Pokémon de las generaciones, con el nombre español como en
   * {@code LearnsetGuessEngine.hint}, sin repetir texto normalizado y en orden de primera aparición; sin barajar.
   */
  public static List<UnownMessage> moveDeck(UnownTranslatorConfig config, LearnsetPokemonCatalog catalog) {
    int reference = Collections.max(config.generations());
    var seen = new LinkedHashSet<String>();
    var deck = new ArrayList<UnownMessage>();
    for (var pokemon : catalog.forGenerations(config.generations(), false)) {
      for (var entry : catalog.levelUpMoves(pokemon.id(), reference)) {
        var move = entry.move();
        var names = move.names();
        var spanish = names == null ? null : names.get("es");
        var spanishName = spanish instanceof String text ? JsStrings.trim(text) : "";
        var name = spanishName.isEmpty() ? move.name() : spanishName;
        var normalized = normalize(name);
        if (letterCount(normalized) < MIN_LETTERS || !seen.add(normalized)) continue;
        deck.add(new UnownMessage(name, normalized, null,
            new UnownTranslatorMove(name, move.type(), move.category())));
      }
    }
    return List.copyOf(deck);
  }

  /**
   * Por qué no se puede jugar con esa configuración, o vacío. Nunca recorre los movimientos: en {@code MOVES} basta con
   * que el catálogo tenga aprendizajes y que haya Pokémon en las generaciones.
   */
  public static Optional<String> availabilityIssue(UnownTranslatorConfig config, PokemonCatalog catalog) {
    if (config.mode() == UnownTranslatorMode.MOVES) {
      if (!(catalog instanceof LearnsetPokemonCatalog) || catalog.forGenerations(config.generations(), false).isEmpty()) {
        return Optional.of("No hay movimientos disponibles en esas generaciones.");
      }
      return Optional.empty();
    }
    int available = pokemonDeck(config, catalog).size();
    if (available < config.rounds()) return Optional.of("Solo hay " + available + " Pokémon en esas generaciones.");
    return Optional.empty();
  }

  /** Clasificación final: puntos, después aciertos y después id del jugador. */
  public static GameResults buildResults(UnownTranslatorState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, UnownTranslatorPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<UnownTranslatorPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<UnownTranslatorPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().solved())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}
