package es.pokemonuniverse.application.profile;

import es.pokemonuniverse.adapters.out.persistence.FriendshipEntity;
import es.pokemonuniverse.adapters.out.persistence.FriendshipRepository;
import es.pokemonuniverse.application.achievements.AchievementService;
import es.pokemonuniverse.application.auth.AccountLookup;
import es.pokemonuniverse.application.auth.UserIdentityMapper;
import es.pokemonuniverse.application.profile.PublicProfile.Friendship;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import jakarta.inject.Singleton;
import java.util.Optional;

/**
 * Perfil de otra cuenta registrada buscada por su nombre de usuario (sin distinguir mayúsculas). Aplica «Perfil visible
 * para»: si quien mira no puede verlo, solo salen el nombre, el avatar, la fecha de alta y la relación de amistad.
 */
@Singleton
public class PublicProfileService {

  private final AccountLookup accounts;
  private final FriendshipRepository friendships;
  private final ProfileService profiles;
  private final AchievementService achievements;

  public PublicProfileService(AccountLookup accounts, FriendshipRepository friendships, ProfileService profiles,
      AchievementService achievements) {
    this.accounts = accounts;
    this.friendships = friendships;
    this.profiles = profiles;
    this.achievements = achievements;
  }

  /** Vacío si no hay ninguna cuenta con ese nombre (o hay varias que solo difieren en mayúsculas). */
  public Optional<PublicProfile> view(String viewerId, String username) {
    return accounts.findByUsername(username).flatMap(target -> {
      var targetId = target.getId();
      var self = targetId.equals(viewerId);
      var pair = self ? Optional.<FriendshipEntity>empty() : friendships.findPair(viewerId, targetId);
      var friendship = self ? Friendship.SELF : pair.map(row -> relation(row, viewerId)).orElse(Friendship.NONE);
      var requestId = pair.filter(row -> FriendshipEntity.PENDING.equals(row.getStatus()))
          .map(FriendshipEntity::getId).orElse(null);
      var user = new PublicProfile.User(targetId, target.getUsername(),
          UserIdentityMapper.avatarFromUser(target.getAvatarType(), target.getAvatarValue(), target.getAvatarVersion()),
          IsoTimestamps.millis(target.getCreatedAt()));
      var visibility = target.getProfileVisibility();
      if (!visibility.visibleTo(self, friendship == Friendship.FRIENDS)) {
        return Optional.of(new PublicProfile(user, visibility, friendship, requestId, true, null, null, null));
      }
      return profiles.profileOf(targetId).map(full -> {
        var list = achievements.listFor(targetId);
        var unlocked = list.stream().filter(a -> a.unlockedAt() != null).toList();
        return new PublicProfile(user, visibility, friendship, requestId, false, full.progress(),
            new PublicProfile.Stats(full.globalStats(), full.games()),
            new PublicProfile.Achievements(unlocked, list.size()));
      });
    });
  }

  private static Friendship relation(FriendshipEntity row, String viewerId) {
    if (FriendshipEntity.ACCEPTED.equals(row.getStatus())) return Friendship.FRIENDS;
    return row.getRequesterId().equals(viewerId) ? Friendship.PENDING_SENT : Friendship.PENDING_RECEIVED;
  }
}
