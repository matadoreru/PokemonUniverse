package es.pokemonuniverse.domain.game.engines.pokedexentryguess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessConfig.PokedexEntryHintConfig;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessAction;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque, catálogos sin entradas de Pokédex,
 * estados que el flujo no produce y el enmascarado del nombre con mayúsculas, acentos y puntuación (los textos de
 * {@code gen1-2} siempre escriben el nombre igual). Los resultados esperados del enmascarado son la salida de
 * {@code sanitizePokedexEntry} de TS sobre las mismas entradas.
 */
class PokedexEntryGuessEngineTest {

  private static final InMemoryPokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");

  private final PokedexEntryGuessEngine engine =
      new PokedexEntryGuessEngine(GoldenManifests.of(PokedexEntryGuessEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(PokemonCatalog catalog, int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(catalog, new Mulberry32(1)).players(list).now(1000).build();
  }

  private static PokedexEntryGuessConfig config(List<Integer> generations, int rounds) {
    return new PokedexEntryGuessConfig(generations, 25, rounds, false,
        new PokedexEntryHintConfig(true, true, true, false, false));
  }

  private static Pokemon golden(String id) {
    return GOLDEN.byId(id).orElseThrow();
  }

  /** Copia de un Pokémon del catálogo con otro id, nombre y nombres localizados. */
  private static Pokemon renamed(Pokemon base, String id, String name, Map<String, Object> names) {
    return new Pokemon(id, base.nationalDexNumber(), name, base.generation(), base.isDefault(), base.sprite(),
        base.shinySprite(), base.palette(), base.paletteWeights(), base.hp(), base.attack(), base.defense(),
        base.specialAttack(), base.specialDefense(), base.speed(), base.baseStatTotal(), base.heightDecimeters(),
        base.weightHectograms(), base.evolutionStage(), base.evolutionStageCount(), base.legendaryStatus(),
        base.color(), base.abilities(), names, base.types());
  }

  /** Solo {@link PokemonCatalog}: el {@code isPokedexEntryPokemonCatalog} de TS devolvería {@code false}. */
  private record PlainCatalog(PokemonCatalog delegate) implements PokemonCatalog {
    @Override
    public List<Pokemon> all() {
      return delegate.all();
    }

    @Override
    public Optional<Pokemon> byId(String id) {
      return delegate.byId(id);
    }

    @Override
    public Optional<Pokemon> byDexNumber(int number) {
      return delegate.byDexNumber(number);
    }

    @Override
    public List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms) {
      return delegate.forGenerations(generations, includeForms);
    }
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokedex-entry-guess", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokedexEntryGuessEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    var longest = "x".repeat(96);
    assertEquals(longest,
        engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":25}", "{\"type\":\"ANSWER\",\"pokemonId\":\"pikachu\"}",
        "{\"pokemonId\":\"pikachu\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTwoPlayersAndAPoolOfAtLeastTwo() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(engine.defaultConfig(), context(GOLDEN, 1)));
    assertEquals("Se necesitan al menos 2 jugadores.", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(9), 3), context(GOLDEN, 2)));
    assertEquals("No hay suficientes Pokémon con entradas Pokédex válidas en español para esta configuración.",
        error.getMessage());
  }

  @Test
  void needsAPokedexEntryCatalog() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), 3), context(new PlainCatalog(GOLDEN), 2)));
    assertEquals("El catálogo Pokémon no contiene entradas Pokédex en español. Ejecuta el seed actualizado.",
        error.getMessage());
  }

  @Test
  void startsOnlyOnceAndPreloadsEachRoundSprite() {
    var preloaded = new ArrayList<String>();
    var context = context(GOLDEN, 2).toBuilder().preloadImage(preloaded::add).build();
    var started = engine.start(engine.createInitialState(config(List.of(1), 5), context), context);
    assertEquals(5, preloaded.size());
    var error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
    // Sin preloadImage (opcional en el contexto) la baraja se prepara igual.
    engine.createInitialState(config(List.of(1), 5), context(GOLDEN, 2));
  }

  /** Con menos Pokémon que rondas, la baraja vuelve a barajar y prefiere entradas aún no usadas. */
  @Test
  void refillsTheDeckWithUnusedEntriesWhenThePoolIsSmall() {
    var pokemon = GoldenCatalogs.pokemon("gen1-2").stream()
        .filter(entry -> Set.of("pikachu", "eevee").contains(entry.id()))
        .toList();
    var entries = GoldenCatalogs.pokedexEntries("gen1-2").stream()
        .filter(entry -> Set.of("pikachu", "eevee").contains(entry.pokemonId()))
        .toList();
    var catalog = new InMemoryPokemonCatalog(pokemon, List.of(), List.of(), Map.of(), entries);
    var state = engine.createInitialState(config(List.of(1), 8), context(catalog, 2));
    // Salida de createInitialState de TS con el mismo catálogo reducido y mulberry32(1).
    assertEquals(List.of("pikachu:6:alpha-sapphire", "eevee:6:x", "pikachu:6:y", "eevee:6:alpha-sapphire",
        "pikachu:6:x", "eevee:6:omega-ruby", "pikachu:6:omega-ruby", "eevee:6:y"),
        state.roundDeck().stream().map(target -> PokedexEntryGuessRules.pokedexEntryKey(target.entry())).toList());
  }

  @Test
  void resolvesTheNearestHistoricalEntryOrTheOldestOne() {
    var entries = GOLDEN.pokedexEntries("pikachu");
    assertEquals(7, PokedexEntryGuessRules.resolvePokedexEntry(entries, 7, () -> 0).generation());
    assertEquals(6, PokedexEntryGuessRules.resolvePokedexEntry(entries, 1, () -> 0).generation());
    assertEquals(8, PokedexEntryGuessRules.resolvePokedexEntry(entries, 9, () -> 0.999).generation());
    var english = new PokedexEntry("pikachu", "Pikachu", "en", 8, "sword", "Sword");
    assertEquals(null, PokedexEntryGuessRules.resolvePokedexEntry(List.of(english), 8, () -> 0));
    // Las entradas excluidas solo se repiten cuando no queda ninguna otra de esa generación.
    var first = PokedexEntryGuessRules.resolvePokedexEntry(entries, 8, () -> 0);
    var second = PokedexEntryGuessRules.resolvePokedexEntry(entries, 8, () -> 0,
        Set.of(PokedexEntryGuessRules.pokedexEntryKey(first)));
    assertNotEquals(first, second);
  }

  /** Estados que el flujo público no produce: la baraja no tiene la ronda en curso o la partida no ha terminado. */
  @Test
  void returnsTheServerLiteralsWhenTheRoundIsMissingFromTheDeck() {
    var context = context(GOLDEN, 2);
    var missing = PokedexEntryGuessState.builder().phase(GamePhase.ROUND_ACTIVE).config(config(List.of(1), 3))
        .playerIds(List.of("p1", "p2")).roundNumber(1).roundStartedAt(1000L).roundEndsAt(26_000L).build();
    var result = engine.handleAction(missing, "p1", new PokedexEntryGuessAction("pikachu"), context);
    assertEquals("La respuesta no está disponible.", result.error());
    var error = assertThrows(EngineException.class, () -> engine.handleTimeout(missing, context.withNow(26_000)));
    assertEquals("La respuesta de la ronda ya no está disponible.", error.getMessage());
    var between = missing.toBuilder().phase(GamePhase.ROUND_RESULTS).roundNumber(0).roundEndsAt(null)
        .nextTransitionAt(5_000L).build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(between, context.withNow(5_000)));
    assertEquals("No se pudo preparar la siguiente entrada Pokédex.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.getResults(missing));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  @Test
  void masksTheNameWithAnyCaseSpacingAndPunctuation() {
    var cases = new LinkedHashMap<List<String>, String>();
    cases.put(List.of("pikachu", "PIKACHU y pikachu, PiKaChU; pero no Pikachus ni superpikachu ni Pikachu2."),
        "??? y ???, ???; pero no Pikachus ni superpikachu ni Pikachu2.");
    cases.put(List.of("pikachu", "  Un Pikachu\n\fsalvaje aparece﻿. "), "Un ??? salvaje aparece .");
    cases.put(List.of("farfetchd", "Farfetch'd, farfetch’d, FARFETCH D y farfetchd: todos iguales."),
        "???, ???, ??? y ???: todos iguales.");
    cases.put(List.of("mr-mime", "mr mime, Mr.Mime, MR. MIME, mr-mime y Mr. Mimes."), "???, ???, ???, ??? y Mr. Mimes.");
    cases.put(List.of("ho-oh", "Ho-Oh, ho oh, HOOH y Ho—Oh brillan; Hooho no."), "???, ???, ??? y ??? brillan; Hooho no.");
    cases.put(List.of("nidoran-f", "Nidoran♀, nidoran♂, NIDORAN F y nidoranf."), "???♀, ???♂, ??? y ???.");
    cases.put(List.of("nidoran-m", "Nidoran♂ ve a Nidoran♀ y a nidoran m."), "???♂ ve a ???♀ y a ???.");
    cases.put(List.of("porygon2", "Porygon2 no es Porygon; porygon 2 sí."), "??? no es Porygon; ??? sí.");
    cases.put(List.of("pikachu", "Píkachu, PIKACHÚ y pikachú no coinciden; Pikachu sí."),
        "Píkachu, PIKACHÚ y pikachú no coinciden; ??? sí.");
    cases.put(List.of("eevee", "Ëevee, EEVEE, Éévéé y eevee."), "Ëevee, ???, Éévéé y ???.");
    cases.forEach((input, expected) ->
        assertEquals(expected, PokedexEntryGuessRules.sanitizePokedexEntry(input.get(1), golden(input.get(0))),
            input.get(1)));
  }

  @Test
  void masksAccentedAndNonLatinAliases() {
    var base = golden("pikachu");
    var flabebe = renamed(base, "flabebe", "Flabébé", Map.of("es", "Flabébé"));
    // NFD: la «e» más el acento combinante no es la «é» del alias en NFC.
    assertEquals("???, ??? y ???; ??? y Flabébé no.", PokedexEntryGuessRules.sanitizePokedexEntry(
        "FLABÉBÉ, flabébé y Flabébé; Flabebe y Flabébé no.", flabebe));
    var typeNull = renamed(base, "type-null", "Tipo: Cero", Map.of("en", "Type: Null", "es", "Código Cero"));
    assertEquals("???, ???, Codigo Cero, ??? y ???.", PokedexEntryGuessRules.sanitizePokedexEntry(
        "CÓDIGO CERO, código cero, Codigo Cero, type null y TYPE:NULL.", typeNull));
    var ninetales = renamed(base, "ninetales", "Ninetales", Map.of("es", "Ninetales", "ja", "キュウコン"));
    assertEquals("??? y ???; xキュウコン no.",
        PokedexEntryGuessRules.sanitizePokedexEntry("キュウコン y ninetales; xキュウコン no.", ninetales));
    var sirfetchd = renamed(base, "sirfetchd", "Sirfetch’d", Map.of("es", "Sirfetch’d"));
    assertEquals("ΣIRFETCH’D? ???, ??? y ???.", PokedexEntryGuessRules.sanitizePokedexEntry(
        "ΣIRFETCH’D? sirfetch’d, SIRFETCH´D y Sir-fetch-d.", sirfetchd));
  }
}
