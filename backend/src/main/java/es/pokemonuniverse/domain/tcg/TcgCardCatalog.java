package es.pokemonuniverse.domain.tcg;

import io.micronaut.core.annotation.Nullable;
import java.util.List;

/** Vista síncrona, propiedad del servidor, de la caché TCG en PostgreSQL ({@code tcg/types.ts}). */
public interface TcgCardCatalog {

  /** {@code price}: decimal canónico no negativo, comparado sin pasar a coma flotante. */
  record Card(String id, String name, String localId, String setId, String setName, @Nullable String rarity,
      String imageUrl, String price, String currency, String provider, String variant) {}

  record Filters(List<Integer> generations, List<String> setIds, List<String> rarities, @Nullable String minPrice,
      @Nullable String maxPrice) {}

  record SetOption(String id, String name, int cardCount) {}

  record RarityOption(String value, int cardCount) {}

  record GenerationOption(int value, int cardCount) {}

  record FilterOptions(boolean ready, int cardCount, List<GenerationOption> generations, List<SetOption> sets,
      List<RarityOption> rarities) {}

  List<Card> cardsFor(Filters filters);

  FilterOptions options();
}
