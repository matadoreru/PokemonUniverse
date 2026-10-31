package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

/**
 * Contexto de motor de una fixture dorada, el mismo que {@code packages/shared/golden/context.ts}: anfitrión
 * {@code players[0]}, {@code now = startNow} (1000), sala {@code GOLD01}, {@code preloadImage} sin efecto y cada
 * catálogo opcional solo si la fixture lo trae. Los catálogos en memoria respetan el orden de la fixture.
 */
public final class GoldenContexts {

  private GoldenContexts() {}

  public static GameContext contextFor(GoldenFixture fixture, PokemonCatalog catalog, DoubleSupplier random) {
    var players = fixture.players();
    var builder = GameContext.builder(catalog, random)
        .players(players)
        .now(fixture.startNow() != null ? fixture.startNow() : 1000L)
        .roomCode(fixture.roomCode() != null ? fixture.roomCode() : "GOLD01")
        .hostId(players.isEmpty() ? null : players.get(0).id())
        .preloadImage(source -> {});
    if (fixture.hostCustomCategories() != null) builder.hostCustomCategories(fixture.hostCustomCategories());
    if (fixture.hostWouldYouRatherPrompts() != null) builder.hostWouldYouRatherPrompts(fixture.hostWouldYouRatherPrompts());
    if (fixture.pokemonVisuals() != null) builder.pokemonVisuals(new FixtureVisuals(fixture.pokemonVisuals()));
    if (fixture.pokemonAudio() != null) builder.pokemonAudio(new FixtureAudio(fixture.pokemonAudio()));
    if (fixture.tcgCards() != null) builder.tcgCards(new FixtureTcgCards(fixture.tcgCards()));
    return builder.build();
  }

  @Nullable
  private static String text(JsonNode node, String key) {
    var value = node.get(key);
    return value == null || value.isNull() ? null : value.getStringValue();
  }

  @Nullable
  private static Integer integer(JsonNode node, String key) {
    var value = node.get(key);
    return value == null || value.isNull() ? null : value.getNumberValue().intValue();
  }

  /** Entero exacto: {@code AlphaBounds} es entero en Java aunque {@code visual-assets.ts} lo normaliza a 0..1. */
  private static int exactInt(JsonNode node, String key) {
    var value = new BigDecimal(node.get(key).getNumberValue().toString());
    try {
      return value.intValueExact();
    } catch (ArithmeticException e) {
      throw new IllegalArgumentException("alphaBounds." + key + " no es entero (" + value
          + "): AlphaBounds de Java no admite fracciones", e);
    }
  }

  /** {@code pokemonVisuals}: {@code Record<string, PokemonVisualAsset>}. */
  private static final class FixtureVisuals implements PokemonVisualCatalog {
    private final Map<String, Asset> assets = new LinkedHashMap<>();

    FixtureVisuals(JsonNode visuals) {
      for (Map.Entry<String, JsonNode> entry : visuals.entries()) {
        var asset = entry.getValue();
        var bounds = asset.get("alphaBounds");
        assets.put(entry.getKey(), new Asset(text(asset, "pokemonId"), Source.valueOf(text(asset, "source")),
            text(asset, "location"), integer(asset, "width"), integer(asset, "height"),
            bounds == null ? null : new AlphaBounds(exactInt(bounds, "x"), exactInt(bounds, "y"),
                exactInt(bounds, "width"), exactInt(bounds, "height"))));
      }
    }

    @Override public @Nullable Asset artworkFor(String pokemonId) { return assets.get(pokemonId); }

    @Override public List<String> artworkPokemonIds() { return List.copyOf(assets.keySet()); }
  }

  /** {@code pokemonAudio}: {@code Record<string, { latest?: string; legacy?: string }>}. */
  private static final class FixtureAudio implements PokemonAudioCatalog {
    private final JsonNode cries;

    FixtureAudio(JsonNode cries) { this.cries = cries; }

    @Override public @Nullable String cryFor(String pokemonId, CryVersion version) {
      var entry = cries.get(pokemonId);
      return entry == null ? null : text(entry, version == CryVersion.LATEST ? "latest" : "legacy");
    }

    @Override public List<String> pokemonIds(@Nullable CryVersion version) {
      var ids = new ArrayList<String>();
      for (Map.Entry<String, JsonNode> entry : cries.entries()) {
        var id = entry.getKey();
        boolean has = version != null ? cryFor(id, version) != null
            : cryFor(id, CryVersion.LATEST) != null || cryFor(id, CryVersion.LEGACY) != null;
        if (has) ids.add(id);
      }
      return List.copyOf(ids);
    }
  }

  /**
   * {@code tcgCards}: cartas ya comparables. Filtra por sets, rarezas y límites de precio comparados como decimales
   * ({@link BigDecimal#compareTo}); no por generación ({@code TcgComparableCard} no la trae) ni por carril de precio.
   */
  private static final class FixtureTcgCards implements TcgCardCatalog {
    private final List<Card> cards = new ArrayList<>();

    FixtureTcgCards(JsonNode json) {
      for (var card : json.values()) {
        cards.add(new Card(text(card, "id"), text(card, "name"), text(card, "localId"), text(card, "setId"),
            text(card, "setName"), text(card, "rarity"), text(card, "imageUrl"), text(card, "price"),
            text(card, "currency"), text(card, "provider"), text(card, "variant")));
      }
    }

    @Override public List<Card> cardsFor(Filters filters) {
      return cards.stream()
          .filter(card -> filters.setIds().isEmpty() || filters.setIds().contains(card.setId()))
          .filter(card -> filters.rarities().isEmpty() || card.rarity() != null && filters.rarities().contains(card.rarity()))
          .filter(card -> filters.minPrice() == null
              || new BigDecimal(card.price()).compareTo(new BigDecimal(filters.minPrice())) >= 0)
          .filter(card -> filters.maxPrice() == null
              || new BigDecimal(card.price()).compareTo(new BigDecimal(filters.maxPrice())) <= 0)
          .toList();
    }

    @Override public FilterOptions options() {
      return new FilterOptions(cards.size() >= 2, cards.size(), List.of(), List.of(), List.of());
    }
  }
}
