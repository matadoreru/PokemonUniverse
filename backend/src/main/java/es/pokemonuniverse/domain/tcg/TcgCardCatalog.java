package es.pokemonuniverse.domain.tcg;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Vista síncrona, propiedad del servidor, de la caché TCG en PostgreSQL ({@code tcg/types.ts}). */
public interface TcgCardCatalog {

  /** {@code price}: decimal canónico no negativo, comparado sin pasar a coma flotante. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Card(String id, String name, String localId, String setId, String setName, @Nullable String rarity,
      String imageUrl, String price, String currency, String provider, String variant) {}

  record Filters(List<Integer> generations, List<String> setIds, List<String> rarities, @Nullable String minPrice,
      @Nullable String maxPrice) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record SetOption(String id, String name, int cardCount) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record RarityOption(String value, int cardCount) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record GenerationOption(int value, int cardCount) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record FilterOptions(boolean ready, int cardCount, List<GenerationOption> generations, List<SetOption> sets,
      List<RarityOption> rarities) {}

  List<Card> cardsFor(Filters filters);

  FilterOptions options();
}
