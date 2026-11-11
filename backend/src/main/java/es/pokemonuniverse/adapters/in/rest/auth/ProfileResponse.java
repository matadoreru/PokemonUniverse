package es.pokemonuniverse.adapters.in.rest.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.profile.UserProfile;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.profile.ProfileVisibility;
import es.pokemonuniverse.domain.progression.Experience;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;

/** Respuesta {@code {"profile": ...}} de {@code GET /api/auth/profile} (UserProfileResponse en shared). */
@Serdeable
public record ProfileResponse(Profile profile) {

  public static ProfileResponse from(UserProfile p) {
    var u = p.user();
    var g = p.globalStats();
    var games = games(p.games());
    return new ProfileResponse(new Profile(
        new ProfileUser(u.id(), u.username(), u.email(), u.avatar(), u.createdAt()),
        new GlobalStats(g.gamesPlayed(), g.gamesWon(), g.totalPoints()),
        Progress.from(p.progress()),
        games,
        p.visibility()));
  }

  /** Los minijuegos con las estadísticas de la cuenta (también los usa el perfil de otra cuenta). */
  public static List<ProfileGame> games(List<UserProfile.Game> games) {
    return games.stream().map(game -> {
      var s = game.stats();
      return new ProfileGame(game.id(), game.name(), game.icon(), game.description(), game.experimental(),
          game.recommended(), game.minPlayers(), game.maxPlayers(), game.profileStats(),
          new GameStats(s.gameId(), s.gamesPlayed(), s.gamesWon(), s.points(), s.metrics()));
    }).toList();
  }

  /** {@code profileVisibility} es el ajuste «Perfil visible para». */
  @Serdeable
  public record Profile(ProfileUser user, GlobalStats globalStats, Progress progress, List<ProfileGame> games,
      ProfileVisibility profileVisibility) {}

  /** Nivel y experiencia: {@code levelXp} y {@code nextLevelXp} son la experiencia total donde empiezan este nivel y el siguiente. */
  @Serdeable
  public record Progress(int level, int xp, int levelXp, int nextLevelXp) {
    public static Progress from(Experience.Progress p) {
      return new Progress(p.level(), p.xp(), p.levelXp(), p.nextLevelXp());
    }
  }

  @Serdeable
  public record ProfileUser(String id, String username, String email, AvatarRef avatar, String createdAt) {}

  @Serdeable
  public record GlobalStats(int gamesPlayed, int gamesWon, int totalPoints) {}

  /** Manifiesto sin {@code defaultConfig}, con las estadisticas del usuario en ese minijuego. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record ProfileGame(
      String id,
      String name,
      String icon,
      String description,
      @Nullable @Schema(nullable = false) Boolean experimental,
      @Nullable @Schema(nullable = false) Boolean recommended,
      int minPlayers,
      @Nullable @Schema(nullable = false) Integer maxPlayers,
      GameManifest.ProfileStatsDefinition profileStats,
      GameStats stats) {}

  @Serdeable
  public record GameStats(String gameId, int gamesPlayed, int gamesWon, int points,
      @JsonInclude(JsonInclude.Include.ALWAYS) Map<String, Number> metrics) {}
}
