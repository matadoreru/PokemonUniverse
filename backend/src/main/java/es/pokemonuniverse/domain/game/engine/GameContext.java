package es.pokemonuniverse.domain.game.engine;

import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import java.util.function.Predicate;

/**
 * Contexto de una llamada a un motor ({@code GameContext}, antes en {@code contracts.ts}). {@code now} en ms epoch y
 * {@code random} en [0, 1) son las únicas fuentes de tiempo y azar; ambos, {@code pokemon} y {@code players}, son
 * obligatorios. Las listas del host nunca son nulas (el {@code ?? []} de los motores TS).
 */
public record GameContext(
    List<GamePlayer> players,
    PokemonCatalog pokemon,
    long now,
    DoubleSupplier random,
    @Nullable String roomCode,
    @Nullable String hostId,
    List<SubjectiveCategory> hostCustomCategories,
    List<WouldYouRatherPromptPair> hostWouldYouRatherPrompts,
    @Nullable TcgCardCatalog tcgCards,
    @Nullable PokemonVisualCatalog pokemonVisuals,
    @Nullable PokemonAudioCatalog pokemonAudio,
    @Nullable Consumer<String> preloadImage,
    @Nullable Consumer<AssetResolution> preloadAsset) {

  public GameContext {
    Objects.requireNonNull(pokemon, "GameContext necesita un catálogo de Pokémon (pokemon)");
    Objects.requireNonNull(random, "GameContext necesita una fuente de azar (random)");
    players = List.copyOf(Objects.requireNonNull(players, "GameContext necesita la lista de jugadores (players)"));
    hostCustomCategories = hostCustomCategories == null ? List.of() : List.copyOf(hostCustomCategories);
    hostWouldYouRatherPrompts = hostWouldYouRatherPrompts == null ? List.of() : List.copyOf(hostWouldYouRatherPrompts);
  }

  /** {@code pokemon} y {@code random} son obligatorios: no hay valores por defecto silenciosos. */
  public static Builder builder(PokemonCatalog pokemon, DoubleSupplier random) {
    return new Builder(pokemon, random);
  }

  public Builder toBuilder() {
    return new Builder(pokemon, random).players(players).now(now).roomCode(roomCode).hostId(hostId)
        .hostCustomCategories(hostCustomCategories).hostWouldYouRatherPrompts(hostWouldYouRatherPrompts)
        .tcgCards(tcgCards).pokemonVisuals(pokemonVisuals).pokemonAudio(pokemonAudio).preloadImage(preloadImage)
        .preloadAsset(preloadAsset);
  }

  public GameContext withNow(long value) {
    return toBuilder().now(value).build();
  }

  public GameContext withPlayers(List<GamePlayer> value) {
    return toBuilder().players(value).build();
  }

  /** Hay host y es {@code playerId}. */
  public boolean isHost(String playerId) {
    return hostId != null && !hostId.isEmpty() && hostId.equals(playerId);
  }

  /** El jugador existe, está conectado y activo. */
  public boolean isPlayerRequired(String playerId) {
    for (var player : players) {
      if (player.id().equals(playerId)) return player.isRequired();
    }
    return false;
  }

  public List<String> connectedRequiredPlayerIds(List<String> candidateIds) {
    return candidateIds.stream().filter(this::isPlayerRequired).toList();
  }

  public boolean allConnectedRequiredCompleted(List<String> candidateIds, Predicate<String> completed) {
    for (var playerId : connectedRequiredPlayerIds(candidateIds)) {
      if (!completed.test(playerId)) return false;
    }
    return true;
  }

  public static final class Builder {
    private List<GamePlayer> players = List.of();
    private final PokemonCatalog pokemon;
    private long now;
    private final DoubleSupplier random;
    private String roomCode;
    private String hostId;
    private List<SubjectiveCategory> hostCustomCategories = List.of();
    private List<WouldYouRatherPromptPair> hostWouldYouRatherPrompts = List.of();
    private TcgCardCatalog tcgCards;
    private PokemonVisualCatalog pokemonVisuals;
    private PokemonAudioCatalog pokemonAudio;
    private Consumer<String> preloadImage;
    private Consumer<AssetResolution> preloadAsset;

    private Builder(PokemonCatalog pokemon, DoubleSupplier random) {
      this.pokemon = Objects.requireNonNull(pokemon, "GameContext necesita un catálogo de Pokémon (pokemon)");
      this.random = Objects.requireNonNull(random, "GameContext necesita una fuente de azar (random)");
    }

    public Builder players(List<GamePlayer> value) { players = value; return this; }

    public Builder now(long value) { now = value; return this; }

    public Builder roomCode(@Nullable String value) { roomCode = value; return this; }

    public Builder hostId(@Nullable String value) { hostId = value; return this; }

    public Builder hostCustomCategories(List<SubjectiveCategory> value) { hostCustomCategories = value; return this; }

    public Builder hostWouldYouRatherPrompts(List<WouldYouRatherPromptPair> value) {
      hostWouldYouRatherPrompts = value;
      return this;
    }

    public Builder tcgCards(@Nullable TcgCardCatalog value) { tcgCards = value; return this; }

    public Builder pokemonVisuals(@Nullable PokemonVisualCatalog value) { pokemonVisuals = value; return this; }

    public Builder pokemonAudio(@Nullable PokemonAudioCatalog value) { pokemonAudio = value; return this; }

    public Builder preloadImage(@Nullable Consumer<String> value) { preloadImage = value; return this; }

    /** Precarga, sin efecto en el estado, de la resolución exacta que servirá {@code resolveAsset}. */
    public Builder preloadAsset(@Nullable Consumer<AssetResolution> value) { preloadAsset = value; return this; }

    public GameContext build() {
      return new GameContext(players, pokemon, now, random, roomCode, hostId, hostCustomCategories,
          hostWouldYouRatherPrompts, tcgCards, pokemonVisuals, pokemonAudio, preloadImage, preloadAsset);
    }
  }
}
