package es.pokemonuniverse.domain.game.engines.oddoneout;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutCategory;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutOption;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CategoryDefinition;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.DoubleSupplier;
import java.util.function.Function;

/**
 * Tableros de El Intruso: tres Pokémon de una categoría secreta del catálogo de Pokémon Connections y un intruso que no
 * está en ella. Un tablero vale si:
 * <ol>
 *   <li>el intruso no está en la categoría;</li>
 *   <li>ninguna otra categoría distintiva ({@link #isDistinctive}) contiene al intruso y a dos de los tres;</li>
 *   <li>en una categoría de datos se prefiere un intruso que comparta tipo o generación con alguno de los tres; en una
 *       curada (lista a mano, incompleta) se exige que no comparta tipo con ninguno y se prefiere su generación;</li>
 *   <li>no se repite categoría mientras quede otra y se prefieren Pokémon no usados;</li>
 *   <li>los cuatro Pokémon son de cuatro líneas evolutivas distintas ({@code lineOf}, la raíz de cada familia): dos
 *       de la misma línea darían una pista que no es la categoría.</li>
 * </ol>
 * La categoría secreta también tiene que ser distintiva. Todo el azar sale de {@code random}, así que la misma
 * semilla da el mismo tablero.
 */
public final class OddOneOutBoards {

  /** Intentos (trío e intruso al azar) por categoría antes de probar la siguiente. */
  public static final int BOARD_ATTEMPTS = 40;

  static final String NO_CATEGORIES = "No hay categorías suficientes en esas generaciones.";

  private OddOneOutBoards() {}

  /**
   * Un tablero generado: las cuatro opciones en orden A–D, cuál es el intruso, la categoría de los otros tres y los ids
   * de los cuatro Pokémon en el orden de las opciones. Es estado de servidor: no se publica durante la ronda.
   */
  public record Board(List<OddOneOutOption> options, String intruderOptionId, OddOneOutCategory category,
      List<String> pokemonIds) {

    public Board {
      options = frozenList(options);
      pokemonIds = frozenList(pokemonIds);
    }
  }

  /** Pokémon de las generaciones, sin formas y con sprite, en el orden del catálogo (el pool de Connections). */
  public static List<Pokemon> pool(List<Integer> generations, PokemonCatalog catalog) {
    return catalog.forGenerations(generations).stream()
        .filter(pokemon -> pokemon.isDefault() && pokemon.sprite() != null && !pokemon.sprite().isEmpty())
        .toList();
  }

  /**
   * Una categoría es distintiva en un pool si sus miembros son como mucho un tercio de él. Un rasgo que comparte casi
   * todo el pool («no es legendario», «tiene un único tipo») no es una respuesta alternativa defendible ni una buena
   * categoría secreta: con la lectura estricta, {@code ordinary} obligaba a que el intruso fuera casi siempre un
   * legendario y el juego se quedaba en «busca al legendario».
   */
  public static boolean isDistinctive(CategoryDefinition definition, List<Pokemon> pool) {
    return isDistinctive(PokemonConnectionsCatalog.membersFor(definition, pool).size(), pool);
  }

  private static boolean isDistinctive(int memberCount, List<Pokemon> pool) {
    return memberCount * 3 <= pool.size();
  }

  /**
   * Por qué no se puede jugar con ese pool, o vacío. Usa la misma búsqueda determinista que el último recurso de
   * {@link #generate}: si da vacío, {@code generate} nunca lanza con ese pool.
   */
  public static Optional<String> availabilityIssue(List<Pokemon> pool, Function<String, String> lineOf) {
    return firstBoard(Index.of(pool, lineOf)) == null ? Optional.of(NO_CATEGORIES) : Optional.empty();
  }

  /**
   * Baraja las categorías no usadas y, detrás, las usadas; en cada una prueba hasta {@link #BOARD_ATTEMPTS} tríos al
   * azar. Si ninguna sale, recurre a la búsqueda determinista de {@link #availabilityIssue}; sin tablero posible,
   * lanza el literal de disponibilidad.
   */
  public static Board generate(List<Pokemon> pool, Set<String> usedCategoryIds, Set<String> usedPokemonIds,
      Function<String, String> lineOf, DoubleSupplier random) {
    var index = Index.of(pool, lineOf);
    var order = new ArrayList<Candidate>(Randoms.shuffled(index.candidates().stream()
        .filter(candidate -> !usedCategoryIds.contains(candidate.definition().id())).toList(), random));
    order.addAll(Randoms.shuffled(index.candidates().stream()
        .filter(candidate -> usedCategoryIds.contains(candidate.definition().id())).toList(), random));
    for (var candidate : order) {
      var unusedMembers = candidate.members().stream()
          .filter(pokemon -> !usedPokemonIds.contains(pokemon.id())).toList();
      var members = lineCount(unusedMembers, lineOf) >= 3 ? unusedMembers : candidate.members();
      for (int attempt = 0; attempt < BOARD_ATTEMPTS; attempt++) {
        var trio = pickTrio(members, lineOf, random);
        if (trio.size() < 3) break;
        var intruders = validIntruders(index, candidate, trio);
        if (intruders.isEmpty()) continue;
        return board(candidate, trio, pickIntruder(candidate, trio, intruders, usedPokemonIds, random), random);
      }
    }
    var fallback = firstBoard(index);
    if (fallback == null) throw new EngineException(NO_CATEGORIES);
    var intruders = validIntruders(index, fallback.candidate(), fallback.trio());
    return board(fallback.candidate(), fallback.trio(),
        pickIntruder(fallback.candidate(), fallback.trio(), intruders, usedPokemonIds, random), random);
  }

  /** Una categoría secreta posible: distintiva, con al menos tres miembros y algún Pokémon fuera de ella. */
  private record Candidate(CategoryDefinition definition, List<Pokemon> members, Set<String> memberIds,
      boolean curated) {}

  /** Un trío de una categoría con algún intruso válido. */
  private record Found(Candidate candidate, List<Pokemon> trio) {}

  /**
   * Las categorías del pool, calculadas una vez: las candidatas, en el orden del catálogo resuelto, y para cada
   * Pokémon los conjuntos de miembros de las categorías distintivas que lo contienen (para la regla 2).
   */
  private record Index(List<Pokemon> pool, List<Candidate> candidates, Map<String, List<Set<String>>> distinctiveOf,
      Function<String, String> lineOf) {

    static Index of(List<Pokemon> pool, Function<String, String> lineOf) {
      var candidates = new ArrayList<Candidate>();
      var distinctiveOf = new HashMap<String, List<Set<String>>>();
      for (var definition : PokemonConnectionsCatalog.resolvedCategoryDefinitions(pool)) {
        var members = PokemonConnectionsCatalog.membersFor(definition, pool);
        if (!isDistinctive(members.size(), pool)) continue;
        var memberIds = new HashSet<String>();
        members.forEach(pokemon -> memberIds.add(pokemon.id()));
        var frozenIds = Set.copyOf(memberIds);
        for (var pokemon : members) {
          distinctiveOf.computeIfAbsent(pokemon.id(), id -> new ArrayList<>()).add(frozenIds);
        }
        if (members.size() >= 3 && members.size() < pool.size()) {
          candidates.add(new Candidate(definition, members, frozenIds,
              !PokemonConnectionsCatalog.isDataCategory(definition.id())));
        }
      }
      return new Index(pool, List.copyOf(candidates), Map.copyOf(distinctiveOf), lineOf);
    }
  }

  /**
   * Tres miembros al azar de tres líneas distintas: cada extracción ({@code randomIndex}) descarta del resto los de la
   * misma línea. Devuelve menos de tres si la categoría no tiene tres líneas.
   */
  private static List<Pokemon> pickTrio(List<Pokemon> members, Function<String, String> lineOf,
      DoubleSupplier random) {
    var remaining = new ArrayList<Pokemon>(members);
    var trio = new ArrayList<Pokemon>();
    while (trio.size() < 3 && !remaining.isEmpty()) {
      var chosen = remaining.get(Randoms.randomIndex(remaining.size(), random));
      var line = lineOf.apply(chosen.id());
      trio.add(chosen);
      remaining.removeIf(pokemon -> lineOf.apply(pokemon.id()).equals(line));
    }
    return trio;
  }

  /** Reglas 1–3 y 5 (la parte obligatoria): los intrusos válidos para ese trío, en el orden del pool. */
  private static List<Pokemon> validIntruders(Index index, Candidate candidate, List<Pokemon> trio) {
    var lines = new HashSet<String>();
    trio.forEach(member -> lines.add(index.lineOf().apply(member.id())));
    var result = new ArrayList<Pokemon>();
    for (var pokemon : index.pool()) {
      if (candidate.memberIds().contains(pokemon.id())) continue;
      if (lines.contains(index.lineOf().apply(pokemon.id()))) continue;
      if (candidate.curated() && trio.stream().anyMatch(member -> sharesType(member, pokemon))) continue;
      if (hasAlternativeAnswer(index, pokemon, trio)) continue;
      result.add(pokemon);
    }
    return result;
  }

  /** Regla 2: otra categoría distintiva contiene al intruso y a dos o más de los tres. */
  private static boolean hasAlternativeAnswer(Index index, Pokemon intruder, List<Pokemon> trio) {
    for (var memberIds : index.distinctiveOf().getOrDefault(intruder.id(), List.of())) {
      int shared = 0;
      for (var member : trio) {
        if (memberIds.contains(member.id())) shared++;
      }
      if (shared >= 2) return true;
    }
    return false;
  }

  private static boolean sharesType(Pokemon first, Pokemon second) {
    return first.types().stream().anyMatch(second.types()::contains);
  }

  /** Preferencias de las reglas 3 y 4 (sin vaciar nunca la lista) y una extracción al azar. */
  private static Pokemon pickIntruder(Candidate candidate, List<Pokemon> trio, List<Pokemon> intruders,
      Set<String> usedPokemonIds, DoubleSupplier random) {
    var preferred = intruders.stream().filter(pokemon -> trio.stream().anyMatch(member ->
        member.generation() == pokemon.generation() || (!candidate.curated() && sharesType(member, pokemon))))
        .toList();
    var pool = preferred.isEmpty() ? intruders : preferred;
    return Randoms.randomItem(Randoms.preferUnused(pool, pokemon -> usedPokemonIds.contains(pokemon.id())), random);
  }

  /**
   * Búsqueda determinista, sin azar: la primera categoría candidata, en el orden del catálogo, con un trío de miembros
   * (por orden de combinación) que tenga algún intruso válido; nulo si no hay ninguno.
   */
  private static @Nullable Found firstBoard(Index index) {
    for (var candidate : index.candidates()) {
      var members = candidate.members();
      for (int first = 0; first < members.size(); first++) {
        for (int second = first + 1; second < members.size(); second++) {
          for (int third = second + 1; third < members.size(); third++) {
            var trio = List.of(members.get(first), members.get(second), members.get(third));
            if (!distinctLines(trio, index.lineOf())) continue;
            if (!validIntruders(index, candidate, trio).isEmpty()) return new Found(candidate, trio);
          }
        }
      }
    }
    return null;
  }

  private static long lineCount(List<Pokemon> pokemon, Function<String, String> lineOf) {
    return pokemon.stream().map(entry -> lineOf.apply(entry.id())).distinct().count();
  }

  private static boolean distinctLines(List<Pokemon> pokemon, Function<String, String> lineOf) {
    return lineCount(pokemon, lineOf) == pokemon.size();
  }

  /** Baraja los cuatro Pokémon para que el intruso caiga en cualquier letra y les asigna A–D. */
  private static Board board(Candidate candidate, List<Pokemon> trio, Pokemon intruder, DoubleSupplier random) {
    var four = new ArrayList<Pokemon>(trio);
    four.add(intruder);
    var shuffled = Randoms.shuffled(four, random);
    var options = new ArrayList<OddOneOutOption>();
    String intruderOptionId = null;
    for (int position = 0; position < shuffled.size(); position++) {
      var pokemon = shuffled.get(position);
      var id = OddOneOutTypes.OPTION_IDS.get(position);
      options.add(OddOneOutOption.of(id, pokemon));
      if (pokemon.id().equals(intruder.id())) intruderOptionId = id;
    }
    return new Board(options, intruderOptionId, OddOneOutCategory.of(candidate.definition()),
        shuffled.stream().map(Pokemon::id).toList());
  }
}
