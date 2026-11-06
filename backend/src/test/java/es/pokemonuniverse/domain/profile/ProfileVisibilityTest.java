package es.pokemonuniverse.domain.profile;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ProfileVisibilityTest {

  @Test
  void ownerAlwaysSeesTheFullProfile() {
    for (var v : ProfileVisibility.values()) {
      assertEquals(true, v.visibleTo(true, false), v.name());
    }
  }

  @Test
  void everyoneShowsItToFriendsAndStrangers() {
    assertEquals(true, ProfileVisibility.EVERYONE.visibleTo(false, true));
    assertEquals(true, ProfileVisibility.EVERYONE.visibleTo(false, false));
  }

  @Test
  void friendsOnlyHidesItFromStrangers() {
    assertEquals(true, ProfileVisibility.FRIENDS.visibleTo(false, true));
    assertEquals(false, ProfileVisibility.FRIENDS.visibleTo(false, false));
  }

  @Test
  void nobodyHidesItFromFriendsToo() {
    assertEquals(false, ProfileVisibility.NOBODY.visibleTo(false, true));
    assertEquals(false, ProfileVisibility.NOBODY.visibleTo(false, false));
  }
}
