package es.pokemonuniverse.application.profile;

import es.pokemonuniverse.application.achievements.AchievementView;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.profile.ProfileVisibility;
import es.pokemonuniverse.domain.progression.Experience;
import io.micronaut.core.annotation.Nullable;
import java.util.List;

/**
 * Perfil de otra cuenta tal como lo ve quien mira. Si es privado para él, {@code progress}, {@code stats},
 * {@code achievements} y la fecha de alta son {@code null}: no se leen siquiera. Nunca lleva el email.
 */
public record PublicProfile(
    User user,
    ProfileVisibility visibility,
    Friendship friendship,
    @Nullable String requestId,
    boolean isPrivate,
    Experience.@Nullable Progress progress,
    @Nullable Stats stats,
    @Nullable Achievements achievements) {

  /** {@code createdAt} es {@code null} en un perfil privado: solo se ven el nombre y el avatar. */
  public record User(String id, String username, AvatarRef avatar, @Nullable String createdAt) {}

  public record Stats(UserProfile.GlobalStats globalStats, List<UserProfile.Game> games) {}

  /** Solo los desbloqueados (un secreto bloqueado no sale ni con su texto de relleno) y el total del catálogo. */
  public record Achievements(List<AchievementView> unlocked, int total) {}

  /** Relación de quien mira con el dueño del perfil. */
  public enum Friendship { NONE, PENDING_SENT, PENDING_RECEIVED, FRIENDS, SELF }
}
