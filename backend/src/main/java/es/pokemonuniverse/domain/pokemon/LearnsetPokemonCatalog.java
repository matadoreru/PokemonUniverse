package es.pokemonuniverse.domain.pokemon;

import java.util.List;
import java.util.Optional;

/**
 * Catálogo con movimientos por nivel y evolución ({@code LearnsetPokemonCatalog} de {@code pokemon/types.ts}).
 * {@code isLearnsetPokemonCatalog(catalog)} de TS es {@code catalog instanceof LearnsetPokemonCatalog}.
 */
public interface LearnsetPokemonCatalog extends PokemonCatalog {

  /** Ordenados por nivel y después por nombre del movimiento; vacío si no hay datos. */
  List<ResolvedLevelUpMove> levelUpMoves(String pokemonId, int referenceGeneration);

  Optional<PokemonEvolutionInfo> evolutionInfo(String pokemonId);
}
