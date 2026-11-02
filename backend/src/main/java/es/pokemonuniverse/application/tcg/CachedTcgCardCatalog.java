package es.pokemonuniverse.application.tcg;

import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import es.pokemonuniverse.domain.text.Collations;
import io.micronaut.core.annotation.Nullable;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code CachedTcgCardCatalog} de {@code comparable-price.ts}: la caché en memoria de las cartas TCG comparables que
 * leen las salas ({@code tcg-higher-lower}) y {@code /api/tcg/*}. {@link #refresh()} sustituye la lista entera de una
 * vez (campo {@code volatile}); cada llamada lee la lista una sola vez, así que nunca mezcla dos versiones.
 *
 * <p>Hasta el primer {@link #refresh()} la caché no está cargada ({@link #loaded()}): las salas ven un mazo vacío, como
 * el array vacío inicial de Node, y {@code /api/tcg/*} responde 500 como Node antes de {@code registerTcgCardCatalog}.
 */
public class CachedTcgCardCatalog implements TcgCardCatalog {

  private static final Logger LOG = LoggerFactory.getLogger(CachedTcgCardCatalog.class);
  private static final Pattern CURRENCY = Pattern.compile("[A-Z]{3}");
  private static final List<String> PRIORITIES = List.of("EUR:cardmarket:standard", "USD:tcgplayer:normal",
      "EUR:cardmarket:holo", "USD:tcgplayer:holofoil", "USD:tcgplayer:reverseholofoil");

  /** Carril de precios: misma moneda, proveedor y variante. */
  record Lane(String currency, String provider, String variant) {

    /** {@code laneKey}: separado por NUL, que la colación ICU ignora, como en Node. */
    String key() {
      return currency + "\0" + provider + "\0" + variant;
    }

    int priority() {
      int index = PRIORITIES.indexOf(currency + ":" + provider.toLowerCase(Locale.ROOT) + ":"
          + variant.toLowerCase(Locale.ROOT));
      return index < 0 ? PRIORITIES.size() : index;
    }
  }

  private record Comparable(String amount, TcgCardRepository.PriceRow price) {}

  private final TcgCardRepository repository;
  private volatile @Nullable List<TcgCardRepository.CardRow> cards;

  public CachedTcgCardCatalog(TcgCardRepository repository) {
    this.repository = repository;
  }

  /** Carga las cartas elegibles y las publica de una vez. */
  public void refresh() {
    var next = repository.loadComparableCards().stream().filter(CachedTcgCardCatalog::eligible).toList();
    cards = next;
    LOG.info("[TCG catalog] loaded {} cards with image and market price from PostgreSQL", next.size());
  }

  /** {@code true} tras el primer {@link #refresh()} correcto. */
  public boolean loaded() {
    return cards != null;
  }

  private List<TcgCardRepository.CardRow> snapshot() {
    var current = cards;
    return current == null ? List.of() : current;
  }

  /** {@code validImage}: {@code new URL(value).protocol === 'https:'} (con {@link URI}; ver pendientes). */
  static boolean validImage(@Nullable String value) {
    if (value == null || value.isEmpty()) return false;
    try {
      var uri = new URI(value);
      return uri.getScheme() != null && uri.getScheme().toLowerCase(Locale.ROOT).equals("https")
          && (uri.getHost() != null || uri.getRawAuthority() != null);
    } catch (URISyntaxException e) {
      return false;
    }
  }

  private static boolean present(@Nullable String value) {
    return value != null && !JsStrings.trim(value).isEmpty();
  }

  private static boolean eligible(TcgCardRepository.CardRow card) {
    return present(card.id()) && present(card.localId()) && present(card.name()) && present(card.setId())
        && present(card.setName()) && validImage(card.imageUrl());
  }

  private static boolean matchesBase(TcgCardRepository.CardRow card, Filters filters) {
    return card.pokemonGenerations().stream().anyMatch(filters.generations()::contains)
        && (filters.setIds().isEmpty() || filters.setIds().contains(card.setId()))
        && (filters.rarities().isEmpty() || card.rarity() != null && filters.rarities().contains(card.rarity()));
  }

  private static boolean validLaneRow(TcgCardRepository.PriceRow price) {
    return CURRENCY.matcher(price.currency()).matches() && present(price.provider()) && present(price.variant())
        && price.market() != null && TcgPrices.canonical(price.market()) != null;
  }

  /** {@code getComparableCardPrice}: el precio del carril con el {@code observedAt} más reciente y canónico. */
  private static @Nullable Comparable comparablePrice(TcgCardRepository.CardRow card, Lane lane) {
    var candidates = new ArrayList<TcgCardRepository.PriceRow>();
    for (var price : card.prices()) {
      if (price.currency().equals(lane.currency()) && price.provider().equals(lane.provider())
          && price.variant().equals(lane.variant())) {
        candidates.add(price);
      }
    }
    // Ordenación estable descendente, como Array.prototype.sort con b - a.
    candidates.sort(Comparator.comparing(TcgCardRepository.PriceRow::observedAt).reversed());
    for (var price : candidates) {
      var amount = price.market() == null ? null : TcgPrices.canonical(price.market());
      if (amount != null) return new Comparable(amount, price);
    }
    return null;
  }

  @Override
  public List<Card> cardsFor(Filters filters) {
    return cardsFor(snapshot(), filters);
  }

  private static List<Card> cardsFor(List<TcgCardRepository.CardRow> cards, Filters filters) {
    var base = cards.stream().filter(card -> matchesBase(card, filters)).toList();
    Map<Lane, Integer> lanes = new LinkedHashMap<>();
    for (var card : base) {
      for (var price : card.prices()) {
        if (!validLaneRow(price)) continue;
        lanes.merge(new Lane(price.currency(), price.provider(), price.variant()), 1, Integer::sum);
      }
    }
    var ordered = new ArrayList<Lane>();
    lanes.forEach((lane, count) -> {
      if (count >= 2) ordered.add(lane);
    });
    var names = Collations.names();
    ordered.sort(Comparator.comparingInt(Lane::priority).thenComparing(Lane::key, names));
    for (var lane : ordered) {
      var result = new ArrayList<Card>();
      for (var card : base) {
        var comparable = comparablePrice(card, lane);
        if (comparable == null) continue;
        if (filters.minPrice() != null && TcgPrices.compare(comparable.amount(), filters.minPrice()) < 0) continue;
        if (filters.maxPrice() != null && TcgPrices.compare(comparable.amount(), filters.maxPrice()) > 0) continue;
        result.add(new Card(card.id(), card.name(), card.localId(), card.setId(), card.setName(), card.rarity(),
            card.imageUrl(), comparable.amount(), lane.currency(), lane.provider(), lane.variant()));
      }
      if (result.size() >= 2) return List.copyOf(result);
    }
    return List.of();
  }

  @Override
  public FilterOptions options() {
    var cards = snapshot();
    var priced = cards.stream().filter(card -> !card.pokemonGenerations().isEmpty() && card.prices().stream()
        .anyMatch(price -> price.market() != null && TcgPrices.canonical(price.market()) != null)).toList();
    record SetCount(String name, Set<String> ids) {}
    Map<String, SetCount> sets = new LinkedHashMap<>();
    Map<String, Set<String>> rarities = new LinkedHashMap<>();
    Map<Integer, Set<String>> generations = new TreeMap<>();
    for (var card : priced) {
      sets.computeIfAbsent(card.setId(), id -> new SetCount(card.setName(), new LinkedHashSet<>())).ids().add(card.id());
      for (var generation : card.pokemonGenerations()) {
        generations.computeIfAbsent(generation, value -> new LinkedHashSet<>()).add(card.id());
      }
      // {@code if (card.rarity)}: la cadena vacía no cuenta.
      if (card.rarity() != null && !card.rarity().isEmpty()) {
        rarities.computeIfAbsent(card.rarity(), value -> new LinkedHashSet<>()).add(card.id());
      }
    }
    var allGenerations = List.copyOf(generations.keySet());
    var names = Collations.names();
    var setOptions = new ArrayList<SetOption>();
    sets.forEach((id, value) -> setOptions.add(new SetOption(id, value.name(), value.ids().size())));
    setOptions.sort(Comparator.comparing(SetOption::name, names));
    var rarityOptions = new ArrayList<RarityOption>();
    rarities.forEach((value, ids) -> rarityOptions.add(new RarityOption(value, ids.size())));
    rarityOptions.sort(Comparator.comparing(RarityOption::value, names));
    var generationOptions = new ArrayList<GenerationOption>();
    generations.forEach((value, ids) -> generationOptions.add(new GenerationOption(value, ids.size())));
    boolean ready = cardsFor(cards, new Filters(allGenerations, List.of(), List.of(), null, null)).size() >= 2;
    return new FilterOptions(ready, priced.size(), generationOptions, setOptions, rarityOptions);
  }
}
