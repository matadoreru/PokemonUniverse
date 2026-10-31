package es.pokemonuniverse.domain.pokemon;

import java.util.List;
import java.util.Optional;

/** Catálogo de Pokémon que ven los motores ({@code PokemonCatalog} de {@code pokemon/types.ts}). */
public interface PokemonCatalog {

  List<Pokemon> all();

  Optional<Pokemon> byId(String id);

  /** Solo formas por defecto. */
  Optional<Pokemon> byDexNumber(int number);

  /** Entradas de esas generaciones en el orden del catálogo; las formas solo con {@code includeForms}. */
  List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms);

  /** {@code forGenerations(generations)} de TS: sin formas. */
  default List<Pokemon> forGenerations(List<Integer> generations) {
    return forGenerations(generations, false);
  }
}
