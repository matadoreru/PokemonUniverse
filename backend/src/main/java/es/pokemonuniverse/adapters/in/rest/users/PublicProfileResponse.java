package es.pokemonuniverse.adapters.in.rest.users;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import es.pokemonuniverse.adapters.in.rest.achievements.AchievementResponse;
import es.pokemonuniverse.adapters.in.rest.achievements.AchievementsResponse;
import es.pokemonuniverse.adapters.in.rest.auth.ProfileResponse;
import es.pokemonuniverse.application.profile.PublicProfile;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.profile.ProfileVisibility;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * Respuesta {@code {"profile": ...}} de {@code GET /api/users/{username}/profile}. Con {@code private: true} no salen
 * {@code progress}, {@code stats} ni {@code achievements} (ni sus claves); {@code requestId} solo con una solicitud
 * pendiente entre las dos cuentas. {@code stats} y {@code achievements} tienen la forma del perfil propio y de
 * {@code GET /api/achievements}, pero los logros son solo los desbloqueados.
 */
@Serdeable
public record PublicProfileResponse(Profile profile) {

  static PublicProfileResponse from(PublicProfile p) {
    var u = p.user();
    var stats = p.stats() == null ? null : new Stats(
        new ProfileResponse.GlobalStats(p.stats().globalStats().gamesPlayed(), p.stats().globalStats().gamesWon(),
            p.stats().globalStats().totalPoints()),
        ProfileResponse.games(p.stats().games()));
    var achievements = p.achievements() == null ? null : new AchievementsResponse(
        p.achievements().unlocked().stream().map(AchievementResponse::of).toList(),
        p.achievements().unlocked().size(), p.achievements().total());
    return new PublicProfileResponse(new Profile(
        new User(u.id(), u.username(), u.avatar(), u.createdAt()),
        p.visibility(), p.friendship(), p.requestId(), p.isPrivate(),
        p.progress() == null ? null : ProfileResponse.Progress.from(p.progress()),
        stats, achievements));
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Profile(
      User user,
      ProfileVisibility visibility,
      PublicProfile.Friendship friendship,
      @Nullable String requestId,
      @JsonProperty("private") boolean isPrivate,
      ProfileResponse.@Nullable Progress progress,
      @Nullable Stats stats,
      @Nullable AchievementsResponse achievements) {}

  /** Sin email: solo lo público de la cuenta; sin {@code createdAt} si el perfil es privado. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record User(String id, String username, AvatarRef avatar, @Nullable String createdAt) {}

  @Serdeable
  public record Stats(ProfileResponse.GlobalStats globalStats, List<ProfileResponse.ProfileGame> games) {}
}
