package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog.CryVersion;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsState;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutState;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeState;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleRaceState;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessState;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionAttempt;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.PokemonBluffAuctionState;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsState;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizState;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessState;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaState;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonTypes.WhosThatPokemonState;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonTypes.ZoomedPokemonState;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * Privacidad de la respuesta de cada ronda en los doce motores con un secreto por ronda. Cada escenario dorado se
 * juega paso a paso ({@link GoldenRun}) y, en cada estado de la fase secreta, ni el ciclo de vida, ni la vista pública,
 * ni la vista de cada jugador contienen el secreto (salvo la de quien ya puede verlo). Las doradas fijan lo grabado:
 * una fuga que entrase al regrabarlas pasaría por «comportamiento esperado» sin este test.
 *
 * <p>Qué es secreto y cuándo lo decide cada motor (ver {@link #RULES}). El secreto se busca en las hojas de texto y en
 * las claves del JSON, nunca en el JSON serializado: un id solo coincide con la hoja entera ({@code mew} no es
 * {@code mewtwo}); un texto (nombre, categoría, etiqueta) coincide sin distinguir mayúsculas dentro de cualquier hoja,
 * siempre que no esté pegado a otra letra o cifra ({@code Abra} no está en {@code Kadabra}); una clave prohibida no
 * puede aparecer en ningún objeto.
 *
 * <p>Para que el test no pase en vacío, cada motor tiene que haber comprobado algún estado con secreto y, salvo Bluff
 * Auction (que nunca revela la lista de válidos), el mismo buscador tiene que encontrar algún secreto ya pasado en la
 * vista pública de una fase de revelado.
 */
class RoundSecretsProjectionTest {

  /**
   * Un secreto vigente: {@code ids} (hoja exacta), {@code texts} (dentro de una hoja) y {@code keys} (claves
   * prohibidas). {@code viewers} son los jugadores cuya vista propia sí puede contenerlo; la pública nunca.
   */
  record Secret(String label, Set<String> ids, Set<String> texts, Set<String> keys, Set<String> viewers) {

    Secret {
      texts = texts.stream().filter(text -> text != null && !text.isBlank()).collect(Collectors.toSet());
    }

    static Secret of(String label, Set<String> ids, Set<String> texts) {
      return new Secret(label, ids, texts, Set.of(), Set.of());
    }
  }

  /**
   * Reglas por motor: los secretos del estado ({@code []} fuera de la fase secreta) y las claves cuyo contenido es
   * entrada de los jugadores y no se mira (solo Pokéddle).
   */
  record Rule(BiFunction<Object, GameContext, List<Secret>> secrets, Set<String> ignoredKeys, boolean revealsSecret) {

    static Rule of(BiFunction<Object, GameContext, List<Secret>> secrets) {
      return new Rule(secrets, Set.of(), true);
    }
  }

  private static final Map<String, Rule> RULES = new LinkedHashMap<>();

  static {
    // Adivinar un Pokémon: en ROUND_ACTIVE nadie ve su id, su nombre ni su sprite real (las vistas solo llevan rutas
    // opacas). Ningún jugador que ya acertó lo ve en su vista propia, así que no hay excepciones.
    RULES.put("pokemon-palette-guess", Rule.of((state, context) -> {
      var s = (PokemonPaletteGuessState) state;
      return s.phase() == GamePhase.ROUND_ACTIVE ? pokemonSecrets(context, List.of(s.targetPokemonId())) : List.of();
    }));
    // Además, la URL real del grito.
    RULES.put("pokemon-cry-quiz", Rule.of((state, context) -> {
      var s = (PokemonCryQuizState) state;
      if (s.phase() != GamePhase.ROUND_ACTIVE) return List.of();
      var secrets = new ArrayList<>(pokemonSecrets(context, List.of(s.targetPokemonId())));
      secrets.add(Secret.of("grito", Set.of(), Set.of(cryUrl(context, s.targetPokemonId(), s.currentCryVersion()))));
      return secrets;
    }));
    // Todos los Pokémon con las estadísticas de la ronda son respuesta válida, más el de origen.
    RULES.put("guess-from-stats", Rule.of((state, context) -> {
      var s = (GuessFromStatsState) state;
      int index = s.roundNumber() - 1;
      if (s.phase() != GamePhase.ROUND_ACTIVE || index < 0 || index >= s.roundDeck().size()) return List.of();
      var round = s.roundDeck().get(index);
      var ids = new ArrayList<String>(round.acceptedPokemonIds());
      ids.add(round.sourcePokemonId());
      return pokemonSecrets(context, ids);
    }));
    // La entrada de la Pokédex es pública, pero saneada: tampoco puede nombrar al Pokémon.
    RULES.put("pokedex-entry-guess", Rule.of((state, context) -> {
      var s = (PokedexEntryGuessState) state;
      int index = s.roundNumber() - 1;
      if (s.phase() != GamePhase.ROUND_ACTIVE || index < 0 || index >= s.roundDeck().size()) return List.of();
      return pokemonSecrets(context, List.of(s.roundDeck().get(index).pokemonId()));
    }));
    // Además, la ubicación real de la imagen recortada.
    RULES.put("zoomed-pokemon", Rule.of((state, context) -> {
      var s = (ZoomedPokemonState) state;
      if (s.phase() != GamePhase.ROUND_ACTIVE) return List.of();
      var secrets = new ArrayList<>(pokemonSecrets(context, List.of(s.targetPokemonId())));
      if (s.visual() != null) secrets.add(Secret.of("imagen", Set.of(), Set.of(s.visual().location())));
      return secrets;
    }));
    RULES.put("whos-that-pokemon", Rule.of((state, context) -> {
      var s = (WhosThatPokemonState) state;
      return s.phase() == GamePhase.ROUND_ACTIVE ? pokemonSecrets(context, List.of(s.targetPokemonId())) : List.of();
    }));
    // Pujas y búsqueda: nadie ve qué Pokémon cumplen la condición. Los que el pujador ya envió son públicos.
    RULES.put("pokemon-bluff-auction", new Rule((state, context) -> {
      var s = (PokemonBluffAuctionState) state;
      if (s.phase() != GamePhase.ROUND_ACTIVE && s.phase() != GamePhase.POKEMON_SEARCH) return List.of();
      var submitted = s.attempts().stream().map(BluffAuctionAttempt::pokemon).map(pokemon -> pokemon.id()).toList();
      return pokemonSecrets(context, s.validPokemonIds().stream().filter(id -> !submitted.contains(id)).toList());
    }, Set.of(), false));
    // Los Pokémon del tablero son públicos; cada grupo (categoría, etiqueta, explicación) solo lo ve quien lo encontró.
    RULES.put("pokemon-connections", Rule.of((state, context) -> {
      var s = (PokemonConnectionsState) state;
      if (s.phase() != GamePhase.ROUND_ACTIVE) return List.of();
      return s.answerGroups().stream().map(group -> {
        var finders = new HashSet<String>();
        s.progress().forEach((playerId, progress) -> {
          if (progress.foundGroupIds().contains(group.id())) finders.add(playerId);
        });
        return new Secret("grupo " + group.id(), Set.of(group.categoryId()), Set.of(group.label(),
            group.explanation()), Set.of(), finders);
      }).toList();
    }));
    // Cada jugador tiene su Pokémon secreto, que sigue oculto en ROUND_RESULTS hasta que lo resuelve o acaba la
    // partida. Los tableros (intentos y pistas) son públicos: el Pokémon que alguien prueba es entrada suya, así que
    // guessedPokemon no se mira.
    RULES.put("pokeddle-race", new Rule((state, context) -> {
      var s = (PokeddleRaceState) state;
      if (s.phase() == GamePhase.GAME_RESULTS) return List.of();
      var secrets = new ArrayList<Secret>();
      s.secretPokemonIds().forEach((playerId, pokemonId) -> {
        if (!s.solved().containsKey(playerId)) secrets.addAll(pokemonSecrets(context, List.of(pokemonId)));
      });
      return secrets;
    }, Set.of("guessedPokemon"), true));
    // Las opciones son públicas; el secreto es cuál es la correcta y el dato que la explica.
    RULES.put("pokemon-trivia", Rule.of((state, context) -> {
      var s = (PokemonTriviaState) state;
      if (s.phase() != GamePhase.ROUND_ACTIVE || s.question() == null) return List.of();
      return List.of(new Secret("respuesta", Set.of(), Set.of(s.question().fact()),
          Set.of("correctOptionId", "fact", "optionDetails"), Set.of()));
    }));
    // Hasta ROUND_RESULTS: quién es el fake (isFake, solo en su vista y si fakeKnows; fakePlayerId, en ninguna) y las
    // dos categorías (la del fake solo la ve el fake; la principal, todos menos él).
    RULES.put("one-of-us-is-fake", Rule.of((state, context) -> {
      var s = (OneOfUsIsFakeState) state;
      if (s.fakePlayerId() == null || s.phase() == GamePhase.ROUND_RESULTS || s.phase() == GamePhase.GAME_RESULTS) {
        return List.of();
      }
      var fake = s.fakePlayerId();
      var normals = new HashSet<>(s.playerIds());
      normals.remove(fake);
      return List.of(
          new Secret("fake", Set.of(), Set.of(), Set.of("fakePlayerId"), Set.of()),
          new Secret("isFake", Set.of(), Set.of(), Set.of("isFake"), Set.of(fake)),
          new Secret("categoría del fake", Set.of(), Set.of(category(s, s.fakeCategoryId())), Set.of(), Set.of(fake)),
          new Secret("categoría principal", Set.of(), Set.of(category(s, s.mainCategoryId())), Set.of(), normals));
    }));
    // Las cuatro opciones son públicas; hasta revelar, nadie ve cuál es el intruso ni la categoría de los otros tres.
    RULES.put("odd-one-out", Rule.of((state, context) -> {
      var s = (OddOneOutState) state;
      if (s.phase() != GamePhase.ROUND_ACTIVE || s.board() == null) return List.of();
      var category = s.board().category();
      return List.of(new Secret("categoría", Set.of(category.id()), Set.of(category.label(), category.explanation()),
          Set.of("intruderOptionId", "category"), Set.of()));
    }));
  }

  @TestFactory
  Stream<DynamicTest> noViewShowsTheRoundSecret() {
    return RULES.entrySet().stream().map(entry -> dynamicTest(entry.getKey(), () -> {
      var engineId = entry.getKey();
      var rule = entry.getValue();
      var tally = new int[2]; // [estados con secreto comprobados, secretos encontrados en una revelación]
      for (var file : GoldenRun.scenarios(engineId)) {
        var name = engineId + "/" + file.getFileName();
        var pending = new ArrayList<Secret>();
        var step = new int[] {-2}; // -2: inicial, -1: tras start, n: tras el paso n
        GoldenRun.forEachSnapshot(engineId, file, run -> {
          var where = name + " @" + (step[0] == -2 ? "initial" : step[0] == -1 ? "afterStart" : "paso " + step[0]);
          step[0]++;
          var secrets = rule.secrets().apply(run.state(), run.context());
          if (secrets.isEmpty()) {
            if (!pending.isEmpty() && pending.stream().anyMatch(secret ->
                find(run.publicState(), secret, rule.ignoredKeys()) != null)) {
              tally[1]++;
            }
            pending.clear();
            return;
          }
          tally[0]++;
          pending.clear();
          pending.addAll(secrets);
          for (var secret : secrets) {
            check(where, "lifecycle", run.lifecycle(), secret, rule);
            check(where, "publicState", run.publicState(), secret, rule);
            for (var player : run.context().players()) {
              if (!secret.viewers().contains(player.id())) {
                check(where, "playerStates." + player.id(), run.playerState(player.id()), secret, rule);
              }
            }
          }
        });
      }
      assertTrue(tally[0] > 0, engineId + ": ningún escenario llega a la fase secreta");
      if (rule.revealsSecret()) {
        assertTrue(tally[1] > 0, engineId + ": el buscador no encuentra el secreto ni al revelarlo");
      }
    }));
  }

  private static void check(String where, String view, JsonNode node, Secret secret, Rule rule) {
    var found = find(node, secret, rule.ignoredKeys());
    if (found != null) fail(where + ": " + view + " muestra el secreto «" + secret.label() + "» en " + found);
  }

  /** Ruta JSON de la primera aparición del secreto, o {@code null}. */
  private static @Nullable String find(JsonNode node, Secret secret, Set<String> ignoredKeys) {
    var patterns = secret.texts().stream()
        .map(text -> Pattern.compile("(?<![\\p{L}\\p{N}])" + Pattern.quote(text) + "(?![\\p{L}\\p{N}])",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE))
        .toList();
    return find("$", node, secret, patterns, ignoredKeys);
  }

  private static @Nullable String find(String path, JsonNode node, Secret secret, List<Pattern> patterns,
      Set<String> ignoredKeys) {
    if (node == null) return null;
    if (node.isString()) {
      var value = node.getStringValue();
      if (secret.ids().contains(value)) return path + " = " + value;
      for (var pattern : patterns) if (pattern.matcher(value).find()) return path + " = " + value;
      return null;
    }
    if (node.isObject()) {
      for (var entry : node.entries()) {
        var key = entry.getKey();
        var child = path + "." + key;
        if (secret.keys().contains(key) || secret.ids().contains(key)) return child;
        for (var pattern : patterns) if (pattern.matcher(key).find()) return child;
        if (ignoredKeys.contains(key)) continue;
        var found = find(child, entry.getValue(), secret, patterns, ignoredKeys);
        if (found != null) return found;
      }
      return null;
    }
    if (node.isArray()) {
      int index = 0;
      for (var item : node.values()) {
        var found = find(path + "[" + index++ + "]", item, secret, patterns, ignoredKeys);
        if (found != null) return found;
      }
    }
    return null;
  }

  /** Id (hoja exacta), nombre y sprites reales de cada Pokémon. */
  private static List<Secret> pokemonSecrets(GameContext context, List<String> ids) {
    var secrets = new ArrayList<Secret>();
    for (var id : ids) {
      if (id == null) continue;
      var pokemon = context.pokemon().byId(id).orElseThrow();
      var texts = new HashSet<String>();
      texts.add(pokemon.name());
      texts.add(pokemon.sprite());
      texts.add(pokemon.shinySprite());
      secrets.add(Secret.of(id, Set.of(pokemon.id()), texts));
    }
    return secrets;
  }

  private static String cryUrl(GameContext context, @Nullable String pokemonId, @Nullable CryVersion version) {
    var audio = context.pokemonAudio();
    if (audio == null || pokemonId == null || version == null) return "";
    var url = audio.cryFor(pokemonId, version);
    return url == null ? "" : url;
  }

  private static String category(OneOfUsIsFakeState state, @Nullable String id) {
    return state.categoryPool().stream().filter(category -> category.id().equals(id)).findFirst()
        .map(SubjectiveCategory::text).orElseThrow();
  }
}
