package es.pokemonuniverse.adapters.in.rest.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;

/** Respuesta {@code {"profile": ...}} de {@code GET /api/auth/profile} (UserProfileResponse en shared). */
@Serdeable
public record ProfileResponse(Profile profile) {

  @Serdeable
  public record Profile(ProfileUser user, GlobalStats globalStats, List<ProfileGame> games) {}

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
      @Nullable Boolean experimental,
      @Nullable Boolean recommended,
      int minPlayers,
      @Nullable Integer maxPlayers,
      GameManifest.ProfileStatsDefinition profileStats,
      GameStats stats) {}

  @Serdeable
  public record GameStats(String gameId, int gamesPlayed, int gamesWon, int points,
      @JsonInclude(JsonInclude.Include.ALWAYS) Map<String, Number> metrics) {}
}
