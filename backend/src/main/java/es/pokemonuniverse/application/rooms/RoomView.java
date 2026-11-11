package es.pokemonuniverse.application.rooms;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.GameSkip.StateView;
import es.pokemonuniverse.domain.room.MemberRole;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.RoomRole;
import es.pokemonuniverse.domain.room.SessionGameSummary;
import es.pokemonuniverse.domain.room.SessionMode;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;

/**
 * {@code RoomView} de {@code room.ts} con exactamente sus claves; las opcionales de TS siempre están presentes, como
 * las envía Node. Se construye con {@link Builder}: son 30 campos.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record RoomView(
    String roomInstanceId,
    long revision,
    @Nullable String gameCatalogVersion,
    String code,
    RoomPhase phase,
    String hostId,
    int maxPlayers,
    List<MemberView> members,
    List<ManifestView> availableGames,
    String selectedGameId,
    @Nullable JsonNode selectedGameConfig,
    SessionMode sessionMode,
    Map<String, JsonNode> gameConfigs,
    List<String> customizedGameIds,
    GameSelectionMode gameSelectionMode,
    Map<String, List<String>> allowedModes,
    @Nullable NextGameVoteView nextGameVote,
    @Nullable StateView gameSkipState,
    int gamesPlayed,
    List<SessionStandingView> sessionStandings,
    List<SessionGameSummary> sessionHistory,
    @Nullable String gameActionEpoch,
    @Nullable JsonNode game,
    @Nullable JsonNode gamePlayerState,
    long serverNow,
    /** En {@code GAME_RESULTS}, cuándo sigue sola la sesión; {@code null} si no sigue sola o fuera de los resultados. */
    @Nullable Long resultsEndsAt,
    /** En {@code GAME_INTRO}, su plazo y quién está listo; {@code null} fuera de la intro. */
    @Nullable IntroView intro,
    int hostCustomCategoryCount,
    int hostWouldYouRatherPromptCount,
    @Nullable DailyView daily) {

  /**
   * {@code GameIntroView}: la intro termina en {@code endsAt} o antes, cuando todos los {@code playerIds} (los jugadores
   * conectados de la partida) están en {@code readyPlayerIds}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record IntroView(long endsAt, List<String> playerIds, List<String> readyPlayerIds) {}

  /** {@code DailyRoomInfo}: la sala es del reto diario; {@code result} llega al terminar la partida. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record DailyView(String gameId, String date, int roundCount, @Nullable DailyOutcomeView result) {}

  /** Resultado del reto en la vista de la sala: puntos, aciertos y el valor de cada ronda. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record DailyOutcomeView(int score, int correct, List<Integer> rounds) {}

  /** {@code RoomMemberView}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MemberView(String id, String displayName, AvatarRef avatar, boolean connected, PresenceStatus presence,
      RoomRole roomRole, MemberRole role, boolean isHost, boolean ready, int sessionPoints,
      @Nullable Integer level, boolean chatMuted) {}

  /** {@code SessionStandingView}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SessionStandingView(String id, String displayName, AvatarRef avatar, int sessionPoints) {}

  /** {@code NextGameVoteOptionView}: una opción de voto, el par juego y modo ({@code mode} nulo sin modos). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record NextGameVoteOptionView(String id, ManifestView game, @Nullable String mode) {}

  /**
   * {@code NextGameVoteView}; {@code ownVoteOptionId} es privado de cada miembro. Los votos, el recuento y el ganador
   * van por id de opción.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record NextGameVoteView(List<NextGameVoteOptionView> options, List<String> eligibleVoterIds,
      List<String> votedPlayerIds, @Nullable String ownVoteOptionId, @Nullable Long endsAt,
      @Nullable String resolvedOptionId, @Nullable Map<String, Integer> tallies, @Nullable Long nextTransitionAt) {

    public NextGameVoteView withOwnVote(@Nullable String optionId) {
      return new NextGameVoteView(options, eligibleVoterIds, votedPlayerIds, optionId, endsAt, resolvedOptionId,
          tallies, nextTransitionAt);
    }
  }


  /** {@code { ...shared, gameSkipState, nextGameVote, gamePlayerState }}: la vista privada de un miembro. */
  public RoomView forMember(@Nullable StateView skipState, @Nullable NextGameVoteView vote,
      @Nullable JsonNode playerState) {
    return toBuilder().gameSkipState(skipState).nextGameVote(vote).gamePlayerState(playerState).build();
  }

  public static Builder builder() {
    return new Builder();
  }

  public Builder toBuilder() {
    return new Builder().roomInstanceId(roomInstanceId).revision(revision).gameCatalogVersion(gameCatalogVersion)
        .code(code).phase(phase).hostId(hostId).maxPlayers(maxPlayers).members(members).availableGames(availableGames)
        .selectedGameId(selectedGameId).selectedGameConfig(selectedGameConfig).sessionMode(sessionMode)
        .gameConfigs(gameConfigs).customizedGameIds(customizedGameIds).gameSelectionMode(gameSelectionMode)
        .allowedModes(allowedModes).nextGameVote(nextGameVote).gameSkipState(gameSkipState).gamesPlayed(gamesPlayed)
        .sessionStandings(sessionStandings).sessionHistory(sessionHistory).gameActionEpoch(gameActionEpoch).game(game)
        .gamePlayerState(gamePlayerState).serverNow(serverNow).resultsEndsAt(resultsEndsAt).intro(intro).hostCustomCategoryCount(hostCustomCategoryCount)
        .hostWouldYouRatherPromptCount(hostWouldYouRatherPromptCount).daily(daily);
  }

  public static final class Builder {
    private String roomInstanceId;
    private long revision;
    private String gameCatalogVersion;
    private String code;
    private RoomPhase phase;
    private String hostId;
    private int maxPlayers;
    private List<MemberView> members = List.of();
    private List<ManifestView> availableGames = List.of();
    private String selectedGameId;
    private JsonNode selectedGameConfig;
    private SessionMode sessionMode;
    private Map<String, JsonNode> gameConfigs = Map.of();
    private List<String> customizedGameIds = List.of();
    private GameSelectionMode gameSelectionMode;
    private Map<String, List<String>> allowedModes = Map.of();
    private NextGameVoteView nextGameVote;
    private StateView gameSkipState;
    private int gamesPlayed;
    private List<SessionStandingView> sessionStandings = List.of();
    private List<SessionGameSummary> sessionHistory = List.of();
    private String gameActionEpoch;
    private JsonNode game;
    private JsonNode gamePlayerState;
    private long serverNow;
    private Long resultsEndsAt;
    private IntroView intro;
    private int hostCustomCategoryCount;
    private int hostWouldYouRatherPromptCount;
    private DailyView daily;

    private Builder() {}

    public Builder roomInstanceId(String v) { roomInstanceId = v; return this; }

    public Builder revision(long v) { revision = v; return this; }

    public Builder gameCatalogVersion(@Nullable String v) { gameCatalogVersion = v; return this; }

    public Builder code(String v) { code = v; return this; }

    public Builder phase(RoomPhase v) { phase = v; return this; }

    public Builder hostId(String v) { hostId = v; return this; }

    public Builder maxPlayers(int v) { maxPlayers = v; return this; }

    public Builder members(List<MemberView> v) { members = v; return this; }

    public Builder availableGames(List<ManifestView> v) { availableGames = v; return this; }

    public Builder selectedGameId(String v) { selectedGameId = v; return this; }

    public Builder selectedGameConfig(@Nullable JsonNode v) { selectedGameConfig = v; return this; }

    public Builder sessionMode(SessionMode v) { sessionMode = v; return this; }

    public Builder gameConfigs(Map<String, JsonNode> v) { gameConfigs = v; return this; }

    public Builder customizedGameIds(List<String> v) { customizedGameIds = v; return this; }

    public Builder gameSelectionMode(GameSelectionMode v) { gameSelectionMode = v; return this; }

    public Builder allowedModes(Map<String, List<String>> v) { allowedModes = v; return this; }

    public Builder nextGameVote(@Nullable NextGameVoteView v) { nextGameVote = v; return this; }

    public Builder gameSkipState(@Nullable StateView v) { gameSkipState = v; return this; }


    public Builder gamesPlayed(int v) { gamesPlayed = v; return this; }

    public Builder sessionStandings(List<SessionStandingView> v) { sessionStandings = v; return this; }

    public Builder sessionHistory(List<SessionGameSummary> v) { sessionHistory = v; return this; }

    public Builder gameActionEpoch(@Nullable String v) { gameActionEpoch = v; return this; }

    public Builder game(@Nullable JsonNode v) { game = v; return this; }

    public Builder gamePlayerState(@Nullable JsonNode v) { gamePlayerState = v; return this; }

    public Builder serverNow(long v) { serverNow = v; return this; }

    public Builder resultsEndsAt(@Nullable Long v) { resultsEndsAt = v; return this; }

    public Builder intro(@Nullable IntroView v) { intro = v; return this; }

    public Builder hostCustomCategoryCount(int v) { hostCustomCategoryCount = v; return this; }

    public Builder hostWouldYouRatherPromptCount(int v) { hostWouldYouRatherPromptCount = v; return this; }

    public Builder daily(@Nullable DailyView v) { daily = v; return this; }

    public RoomView build() {
      return new RoomView(roomInstanceId, revision, gameCatalogVersion, code, phase, hostId, maxPlayers, members,
          availableGames, selectedGameId, selectedGameConfig, sessionMode, gameConfigs, customizedGameIds,
          gameSelectionMode, allowedModes, nextGameVote, gameSkipState, gamesPlayed, sessionStandings, sessionHistory,
          gameActionEpoch, game, gamePlayerState, serverNow, resultsEndsAt, intro, hostCustomCategoryCount,
          hostWouldYouRatherPromptCount, daily);
    }
  }
}
