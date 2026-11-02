package es.pokemonuniverse.application.tcg;

import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.util.List;

/**
 * Lectura de las cartas comparables ({@code TcgCardRepository.loadComparableCards} de {@code tcg/repository.ts}):
 * cartas con {@code imageUrl} y al menos un precio con {@code market}, cada una con sus precios con {@code market} y las
 * generaciones distintas de sus Pokémon vinculados.
 */
@FunctionalInterface
public interface TcgCardRepository {

  /** {@code market} es el decimal tal como sale de la columna ({@code numeric(12,4)}) en texto plano. */
  record PriceRow(String provider, String currency, String variant, @Nullable String market, Instant observedAt) {}

  /** {@code TcgCatalogCardRow}; {@code prices} se usa tal cual (sin copiar). */
  record CardRow(String id, @Nullable String localId, String name, @Nullable String rarity, @Nullable String imageUrl,
      String setId, String setName, List<Integer> pokemonGenerations, List<PriceRow> prices) {}

  List<CardRow> loadComparableCards();
}
