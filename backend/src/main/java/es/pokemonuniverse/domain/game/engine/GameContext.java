package es.pokemonuniverse.domain.game.engine;

import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import java.util.function.Predicate;

/**
 * Contexto de una llamada a un motor ({@code GameContext} de {@code contracts.ts}). {@code now} en ms epoch y
 * {@code random} en [0, 1) son las únicas fuentes de tiempo y azar. Las listas del host nunca son nulas (el
 * {@code ?? []} de los motores TS).
 */
public record GameContext(
    List<GamePlayer> players,
    @Nullable PokemonCatalog pokemon,
    long now,
    DoubleSupplier random,
    @Nullable String roomCode,
    @Nullable String hostId,
    List<SubjectiveCategory> hostCustomCategories,
    List<WouldYouRatherPromptPair> hostWouldYouRatherPrompts,
    @Nullable TcgCardCatalog tcgCards,
    @Nullable PokemonVisualCatalog pokemonVisuals,
    @Nullable PokemonAudioCatalog pokemonAudio,
    @Nullable Consumer<String> preloadImage) {

  public GameContext {
    players = List.copyOf(players);
    hostCustomCategories = hostCustomCategories == null ? List.of() : List.copyOf(hostCustomCategories);
    hostWouldYouRatherPrompts = hostWouldYouRatherPrompts == null ? List.of() : List.copyOf(hostWouldYouRatherPrompts);
  }

  public static Builder builder() {
    return new Builder();
  }

  public Builder toBuilder() {
    return new Builder().players(players).pokemon(pokemon).now(now).random(random).roomCode(roomCode).hostId(hostId)
        .hostCustomCategories(hostCustomCategories).hostWouldYouRatherPrompts(hostWouldYouRatherPrompts)
        .tcgCards(tcgCards).pokemonVisuals(pokemonVisuals).pokemonAudio(pokemonAudio).preloadImage(preloadImage);
  }

  public GameContext withNow(long value) {
    return toBuilder().now(value).build();
  }

  public GameContext withPlayers(List<GamePlayer> value) {
    return toBuilder().players(value).build();
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
    private PokemonCatalog pokemon;
    private long now;
    private DoubleSupplier random;
    private String roomCode;
    private String hostId;
    private List<SubjectiveCategory> hostCustomCategories = List.of();
    private List<WouldYouRatherPromptPair> hostWouldYouRatherPrompts = List.of();
    private TcgCardCatalog tcgCards;
    private PokemonVisualCatalog pokemonVisuals;
    private PokemonAudioCatalog pokemonAudio;
    private Consumer<String> preloadImage;

    private Builder() {}

    public Builder players(List<GamePlayer> value) { players = value; return this; }

    public Builder pokemon(@Nullable PokemonCatalog value) { pokemon = value; return this; }

    public Builder now(long value) { now = value; return this; }

    public Builder random(DoubleSupplier value) { random = value; return this; }

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

    public GameContext build() {
      return new GameContext(players, pokemon, now, random, roomCode, hostId, hostCustomCategories,
          hostWouldYouRatherPrompts, tcgCards, pokemonVisuals, pokemonAudio, preloadImage);
    }
  }
}
