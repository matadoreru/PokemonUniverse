package es.pokemonuniverse.application.datasync.tcg;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.time.Instant;
import java.util.List;

/** Escritura del catálogo TCG de la sincronización con TCGdex (tablas {@code TcgSet}, {@code TcgCard}, ...). */
public interface TcgCatalogStore {

  /** Fila de {@code TcgSet}; {@code metadata} es la respuesta entera del set. */
  record SetRow(String id, String name, @Nullable String series, @Nullable String logoUrl, @Nullable String symbolUrl,
      @Nullable Instant releaseDate, @Nullable Integer cardCount, JsonNode metadata) {}

  /** Fila de {@code TcgCard}; {@code metadata} es la respuesta entera de la carta. */
  record CardRow(String id, @Nullable String localId, String setId, String name, @Nullable String category,
      @Nullable Integer hp, @Nullable String rarity, @Nullable String imageUrl, @Nullable String illustrator,
      JsonNode metadata, Instant sourceUpdatedAt) {}

  /** Ids de todas las cartas guardadas, por id. */
  List<String> cardIds();

  long countCards();

  /** Upsert por id con {@code sourceUpdatedAt = now}. */
  void upsertSet(SetRow set, Instant now);

  /** Upsert por id. */
  void upsertCard(CardRow card, Instant now);

  /**
   * Sustituye en una transacción los vínculos {@code TcgCardPokemon} de la carta por los Pokémon por defecto con esos
   * números de la Pokédex nacional (lista vacía: sin vínculos).
   */
  void replaceCardPokemon(String cardId, List<Integer> nationalDexNumbers);

  /** Upsert por {@code (cardId, provider, currency, variant)}; al actualizar, {@code observedAt = now}. */
  void upsertPrices(String cardId, List<TcgDexPayloads.PriceLeaf> prices, Instant now);
}
