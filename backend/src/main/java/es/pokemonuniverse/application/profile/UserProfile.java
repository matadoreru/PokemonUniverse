package es.pokemonuniverse.application.profile;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.profile.ProfileVisibility;
import es.pokemonuniverse.domain.progression.Experience;
import java.util.List;
import java.util.Map;

/** Perfil de un usuario registrado tal como lo compone la aplicación; el adaptador REST lo serializa. */
public record UserProfile(User user, GlobalStats globalStats, Experience.Progress progress, List<Game> games,
    ProfileVisibility visibility) {

  public record User(String id, String username, String email, AvatarRef avatar, String createdAt) {}

  public record GlobalStats(int gamesPlayed, int gamesWon, int totalPoints) {}

  /** Manifiesto sin {@code defaultConfig}, con las estadisticas del usuario en ese minijuego. */
  public record Game(
      String id,
      String name,
      String icon,
      String description,
      Boolean experimental,
      Boolean recommended,
      int minPlayers,
      Integer maxPlayers,
      GameManifest.ProfileStatsDefinition profileStats,
      GameStats stats) {}

  public record GameStats(String gameId, int gamesPlayed, int gamesWon, int points, Map<String, Number> metrics) {}
}
