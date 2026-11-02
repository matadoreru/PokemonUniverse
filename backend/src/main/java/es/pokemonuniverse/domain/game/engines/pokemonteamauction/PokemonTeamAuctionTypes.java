package es.pokemonuniverse.domain.game.engines.pokemonteamauction;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code pokemon-team-auction/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokemonTeamAuctionTypes {

  private PokemonTeamAuctionTypes() {}

  /** {@code legendaryStatus} es {@code 'NORMAL' | 'LEGENDARY' | 'MYTHICAL'}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TeamAuctionPokemon(String id, String name, String sprite, int baseStatTotal, String legendaryStatus) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TeamAuctionLotResult(int lotNumber, TeamAuctionPokemon pokemon, @Nullable String winnerId, int bid) {

    /** {@code { ...result, winnerId: null, bid: 0 }}: el lote queda sin dueño. */
    TeamAuctionLotResult unowned() {
      return new TeamAuctionLotResult(lotNumber, pokemon, null, 0);
    }
  }

  /**
   * {@code TeamAuctionBidEvent}: las dos variantes de la unión ({@code BID} con {@code amount}, {@code PASS} sin esa
   * clave) en un único record; {@code amount} se omite cuando es nulo.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TeamAuctionBidEvent(int lotNumber, String playerId, String type,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer amount) {

    static TeamAuctionBidEvent bid(int lotNumber, String playerId, int amount) {
      return new TeamAuctionBidEvent(lotNumber, playerId, "BID", amount);
    }

    static TeamAuctionBidEvent pass(int lotNumber, String playerId) {
      return new TeamAuctionBidEvent(lotNumber, playerId, "PASS", null);
    }
  }

  /**
   * {@code TeamAuctionPlayerStats}: siete contadores contiguos, que se construyen con {@link #of}. El orden de
   * {@link #toMap()} es el de {@code { ...teamStats(participant), lotsWon, unownedLots }}.
   */
  public record TeamAuctionPlayerStats(int lotsWon, int pokemonWon, int bstTotal, int coinsRemaining,
      int legendaryCount, int mythicalCount, int unownedLots) {

    /** {@code participantStats(participant, lotsWon, unownedLots)} de {@code rules.ts}. */
    static TeamAuctionPlayerStats of(TeamAuctionParticipant participant, int lotsWon, int unownedLots) {
      int bstTotal = 0;
      int legendaryCount = 0;
      int mythicalCount = 0;
      for (var pokemon : participant.team()) {
        bstTotal += pokemon.baseStatTotal();
        if ("LEGENDARY".equals(pokemon.legendaryStatus())) legendaryCount += 1;
        if ("MYTHICAL".equals(pokemon.legendaryStatus())) mythicalCount += 1;
      }
      return new TeamAuctionPlayerStats(lotsWon, participant.team().size(), bstTotal, participant.coins(),
          legendaryCount, mythicalCount, unownedLots);
    }

    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("pokemonWon", pokemonWon);
      mapped.put("bstTotal", bstTotal);
      mapped.put("coinsRemaining", coinsRemaining);
      mapped.put("legendaryCount", legendaryCount);
      mapped.put("mythicalCount", mythicalCount);
      mapped.put("lotsWon", lotsWon);
      mapped.put("unownedLots", unownedLots);
      return mapped;
    }
  }

  /**
   * {@code TeamAuctionParticipant}. Los componentes siguen el orden de {@code copyParticipant}
   * ({@code { coins, team, playerId }}), que es el que llega a la proyección pública.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TeamAuctionParticipant(int coins, List<TeamAuctionPokemon> team, String playerId) {

    public TeamAuctionParticipant {
      team = frozenList(team);
    }

    /** {@code updatedWinner.coins -= bid; updatedWinner.team.push(pokemon)}. */
    TeamAuctionParticipant afterWinning(int bid, TeamAuctionPokemon pokemon) {
      var nextTeam = new ArrayList<>(team);
      nextTeam.add(pokemon);
      return new TeamAuctionParticipant(coins - bid, nextTeam, playerId);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokemonTeamAuctionState(
      @Nullable Long roundEndsAt,
      GamePhase phase,
      PokemonTeamAuctionConfig config,
      List<String> playerIds,
      List<TeamAuctionPokemon> lots,
      int currentLotIndex,
      @Nullable Integer currentBid,
      @Nullable String currentBidderId,
      List<String> turnOrder,
      int turnIndex,
      List<String> passedPlayerIds,
      List<TeamAuctionBidEvent> bidHistory,
      List<TeamAuctionLotResult> lotHistory,
      Map<String, TeamAuctionParticipant> participants,
      Map<String, TeamAuctionPlayerStats> playerStats,
      Map<String, Integer> scores,
      @Nullable GameResults results) {

    public PokemonTeamAuctionState {
      playerIds = frozenList(playerIds);
      lots = frozenList(lots);
      turnOrder = frozenList(turnOrder);
      passedPlayerIds = frozenList(passedPlayerIds);
      bidHistory = frozenList(bidHistory);
      lotHistory = frozenList(lotHistory);
      participants = frozenMap(participants);
      playerStats = frozenMap(playerStats);
      scores = frozenMap(scores);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().roundEndsAt(roundEndsAt).phase(phase).config(config).playerIds(playerIds).lots(lots)
          .currentLotIndex(currentLotIndex).currentBid(currentBid).currentBidderId(currentBidderId)
          .turnOrder(turnOrder).turnIndex(turnIndex).passedPlayerIds(passedPlayerIds).bidHistory(bidHistory)
          .lotHistory(lotHistory).participants(participants).playerStats(playerStats).scores(scores)
          .results(results);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private Long roundEndsAt;
      private GamePhase phase;
      private PokemonTeamAuctionConfig config;
      private List<String> playerIds = List.of();
      private List<TeamAuctionPokemon> lots = List.of();
      private int currentLotIndex;
      private Integer currentBid;
      private String currentBidderId;
      private List<String> turnOrder = List.of();
      private int turnIndex;
      private List<String> passedPlayerIds = List.of();
      private List<TeamAuctionBidEvent> bidHistory = List.of();
      private List<TeamAuctionLotResult> lotHistory = List.of();
      private Map<String, TeamAuctionParticipant> participants = Map.of();
      private Map<String, TeamAuctionPlayerStats> playerStats = Map.of();
      private Map<String, Integer> scores = Map.of();
      private GameResults results;

      private Builder() {}

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonTeamAuctionConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder lots(List<TeamAuctionPokemon> value) { lots = value; return this; }

      public Builder currentLotIndex(int value) { currentLotIndex = value; return this; }

      public Builder currentBid(@Nullable Integer value) { currentBid = value; return this; }

      public Builder currentBidderId(@Nullable String value) { currentBidderId = value; return this; }

      public Builder turnOrder(List<String> value) { turnOrder = value; return this; }

      public Builder turnIndex(int value) { turnIndex = value; return this; }

      public Builder passedPlayerIds(List<String> value) { passedPlayerIds = value; return this; }

      public Builder bidHistory(List<TeamAuctionBidEvent> value) { bidHistory = value; return this; }

      public Builder lotHistory(List<TeamAuctionLotResult> value) { lotHistory = value; return this; }

      public Builder participants(Map<String, TeamAuctionParticipant> value) { participants = value; return this; }

      public Builder playerStats(Map<String, TeamAuctionPlayerStats> value) { playerStats = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public PokemonTeamAuctionState build() {
        return new PokemonTeamAuctionState(roundEndsAt, Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), playerIds, lots, currentLotIndex, currentBid, currentBidderId,
            turnOrder, turnIndex, passedPlayerIds, bidHistory, lotHistory, participants, playerStats, scores,
            results);
      }
    }
  }

  /** {@code pokemonTeamAuctionActionSchema}: unión discriminada por {@code type}, cada variante estricta. */
  public sealed interface PokemonTeamAuctionAction {

    /** {@code amount}: {@code z.number().int().min(1).max(100_000)}; admite {@code 5.0} y rechaza {@code 5.5}. */
    record RaiseBid(int amount) implements PokemonTeamAuctionAction {}

    record PassBid() implements PokemonTeamAuctionAction {}

    static PokemonTeamAuctionAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "RAISE_BID" -> {
          strict(raw, Set.of("type", "amount"));
          var amount = raw.get("amount");
          if (amount == null || !amount.isNumber()) throw invalid();
          double number = amount.getDoubleValue();
          if (number != Math.rint(number) || Double.isInfinite(number) || number < 1 || number > 100_000) {
            throw invalid();
          }
          yield new RaiseBid((int) number);
        }
        case "PASS_BID" -> {
          strict(raw, Set.of("type"));
          yield new PassBid();
        }
        default -> throw invalid();
      };
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokémon Team Auction no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTeamAuctionPublicState(
      @Nullable Long roundEndsAt,
      String gameId,
      GamePhase phase,
      int lotNumber,
      int totalLots,
      @Nullable TeamAuctionPokemon currentPokemon,
      @Nullable Integer currentBid,
      int minimumBid,
      @Nullable String currentBidderId,
      @Nullable String currentTurnPlayerId,
      List<String> turnOrder,
      List<String> passedPlayerIds,
      List<TeamAuctionBidEvent> bidHistory,
      List<TeamAuctionLotResult> lotHistory,
      Map<String, TeamAuctionParticipant> participants,
      Map<String, Integer> scores,
      @Nullable GameResults results) {}

  /** Las dos variantes de TS ({@code PLAYER}/{@code SPECTATOR}) tienen las mismas claves: un único record. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTeamAuctionPlayerState(String role, boolean canRaise, boolean canPass, int minimumBid,
      int coins, List<TeamAuctionPokemon> team) {

    static PokemonTeamAuctionPlayerState spectator(int minimumBid) {
      return new PokemonTeamAuctionPlayerState("SPECTATOR", false, false, minimumBid, 0, List.of());
    }
  }
}
