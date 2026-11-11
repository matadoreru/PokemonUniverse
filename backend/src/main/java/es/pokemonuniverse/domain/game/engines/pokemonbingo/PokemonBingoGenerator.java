package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.GeneratedBingoBoard;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionCell;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionDifficulty;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerationOptions;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerator;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionRules;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionTemplate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.DoubleSupplier;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * Traducción literal del TS que antes estaba en {@code pokemon-bingo/generator.ts}; las plantillas salen del generador
 * compartido ({@code ConditionGenerator}). Consume {@code random} como el TS: {@link #buildBingoConditionTemplates}
 * solo baraja las plantillas simples cuando hay casillas de dos condiciones, y {@link #generateBingoBoard} saca una
 * extracción por casilla y por intento, también en los intentos que se descartan.
 */
public final class PokemonBingoGenerator {

  private static final int MAX_ATTEMPTS = 500;

  private PokemonBingoGenerator() {}

  /** {@code buildBingoConditionTemplates}: el {@code combinationLimit} depende del tamaño del cartón. */
  public static List<ConditionTemplate> buildBingoConditionTemplates(List<Pokemon> pool, PokemonBingoConfig config,
      DoubleSupplier random) {
    int combinationLimit = Math.min(320, Math.max(config.width() * config.height() * 12, 80));
    return ConditionGenerator.buildConditionTemplates(pool, new ConditionGenerationOptions(config.generations(),
        config.families(), config.maxConditionsPerCell(), combinationLimit), random);
  }

  /** {@code findPerfectBingoMatching}: caminos de aumento desde las casillas con menos candidatos. */
  public static Map<String, String> findPerfectBingoMatching(List<ConditionCell> cells, List<Pokemon> pool) {
    var candidates = new LinkedHashMap<String, List<String>>();
    for (var cell : cells) {
      candidates.put(cell.id(), pool.stream()
          .filter(pokemon -> ConditionRules.pokemonMatchesBingoCell(pokemon, cell))
          .map(Pokemon::id)
          .toList());
    }
    if (candidates.values().stream().anyMatch(List::isEmpty)) return null;
    var pokemonToCell = new LinkedHashMap<String, String>();
    var cellIds = new HashSet<String>();
    for (var cell : cells) cellIds.add(cell.id());
    var ordered = new ArrayList<>(cells);
    ordered.sort((a, b) -> candidates.get(a.id()).size() - candidates.get(b.id()).size());
    for (var cell : ordered) {
      if (!visit(cell.id(), new HashSet<>(), candidates, pokemonToCell)) return null;
    }
    var result = new LinkedHashMap<String, String>();
    for (var entry : pokemonToCell.entrySet()) {
      if (cellIds.contains(entry.getValue())) result.put(entry.getValue(), entry.getKey());
    }
    return result.size() == cells.size() ? result : null;
  }

  private static boolean visit(String cellId, Set<String> seenPokemon, Map<String, List<String>> candidates,
      Map<String, String> pokemonToCell) {
    for (var pokemonId : candidates.getOrDefault(cellId, List.of())) {
      if (!seenPokemon.add(pokemonId)) continue;
      var occupiedBy = pokemonToCell.get(pokemonId);
      if (occupiedBy == null || visit(occupiedBy, seenPokemon, candidates, pokemonToCell)) {
        pokemonToCell.put(pokemonId, cellId);
        return true;
      }
    }
    return false;
  }

  /**
   * {@code generateBingoBoard}: cada casilla elige plantilla con
   * {@code options[(Math.floor(random() * options.length) + salt) % options.length]} (no es {@code randomItem}: lleva
   * {@code salt} y no recorta el índice).
   */
  public static GeneratedBingoBoard generateBingoBoard(List<ConditionTemplate> templates, List<Pokemon> pool,
      int width, int height, DoubleSupplier random, Set<String> forbiddenSignatures, int variant) {
    int cellCount = width * height;
    if (templates.size() < cellCount) {
      throw new EngineException("No se puede generar un tablero " + width + "×" + height + ": solo hay "
          + templates.size() + " condiciones distintas válidas.");
    }
    boolean anyCombined = templates.stream().anyMatch(template -> template.conditions().size() == 2);
    for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      var used = new HashSet<String>();
      var cells = new ArrayList<ConditionCell>();
      for (int index = 0; index < cellCount; index += 1) {
        var tier = index % 7 == 0 ? ConditionDifficulty.HARD
            : index % 3 == 0 ? ConditionDifficulty.MEDIUM
            : ConditionDifficulty.EASY;
        int wanted = anyCombined && index % 3 == 0 ? 2 : 1;
        var options = filter(templates, template -> !used.contains(template.key()) && template.difficulty() == tier
            && template.conditions().size() == wanted);
        if (options.isEmpty()) {
          options = filter(templates, template -> !used.contains(template.key())
              && template.conditions().size() == wanted);
        }
        if (options.isEmpty()) options = filter(templates, template -> !used.contains(template.key()));
        if (options.isEmpty()) break;
        int salt = variant + attempt * cellCount + index;
        var selected = options.get(((int) Math.floor(random.getAsDouble() * options.size()) + salt) % options.size());
        used.add(selected.key());
        cells.add(new ConditionCell("cell-" + (index + 1), selected.conditions()));
      }
      if (cells.size() != cellCount) continue;
      var signature = cells.stream().map(cell -> ConditionRules.bingoCellKey(cell.conditions()))
          .collect(Collectors.joining("|"));
      if (forbiddenSignatures.contains(signature)) continue;
      var solutionPokemonIds = findPerfectBingoMatching(cells, pool);
      if (solutionPokemonIds != null) return new GeneratedBingoBoard(cells, solutionPokemonIds, signature);
    }
    throw new EngineException("No se puede generar un tablero " + width + "×" + height
        + " globalmente resoluble con esta configuración. Activa más generaciones o familias de condiciones.");
  }

  private static List<ConditionTemplate> filter(List<ConditionTemplate> templates,
      Predicate<ConditionTemplate> keep) {
    return templates.stream().filter(keep).toList();
  }
}
