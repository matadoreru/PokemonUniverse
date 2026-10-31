package es.pokemonuniverse.application.profile;

import es.pokemonuniverse.adapters.out.persistence.UserGameStatsEntity;
import es.pokemonuniverse.adapters.out.persistence.UserGameStatsRepository;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.adapters.out.persistence.UserStatsRepository;
import es.pokemonuniverse.application.auth.UserIdentityMapper;
import es.pokemonuniverse.application.profile.UserProfile.Game;
import es.pokemonuniverse.application.profile.UserProfile.GameStats;
import es.pokemonuniverse.application.profile.UserProfile.GlobalStats;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import jakarta.inject.Singleton;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** Compone el perfil de un usuario registrado: datos publicos, totales y estadisticas de cada minijuego. */
@Singleton
public class ProfileService {

  private final UserRepository users;
  private final UserStatsRepository globalStats;
  private final UserGameStatsRepository gameStats;
  private final GameRegistry registry;

  public ProfileService(UserRepository users, UserStatsRepository globalStats, UserGameStatsRepository gameStats,
      GameRegistry registry) {
    this.users = users;
    this.globalStats = globalStats;
    this.gameStats = gameStats;
    this.registry = registry;
  }

  /** Vacio si la cuenta ya no existe (el token puede sobrevivir al borrado de la fila). */
  public Optional<UserProfile> profileOf(String userId) {
    return users.findById(userId).map(user -> {
      var totals = globalStats.findById(userId)
          .map(s -> new GlobalStats(s.getGamesPlayed(), s.getGamesWon(), s.getTotalPoints()))
          .orElse(new GlobalStats(0, 0, 0));
      Map<String, UserGameStatsEntity> byGame = new LinkedHashMap<>();
      gameStats.findByUserId(userId).forEach(row -> byGame.put(row.getGameId(), row));
      var games = registry.manifests().stream().map(m -> game(m, byGame.get(m.id()))).toList();
      var avatar = UserIdentityMapper.avatarFromUser(user.getAvatarType(), user.getAvatarValue(), user.getAvatarVersion());
      var publicUser = new UserProfile.User(user.getId(), user.getUsername(), user.getEmail(), avatar,
          IsoTimestamps.millis(user.getCreatedAt()));
      return new UserProfile(publicUser, totals, games);
    });
  }

  private static Game game(GameManifest m, UserGameStatsEntity row) {
    var stats = row == null
        ? new GameStats(m.id(), 0, 0, 0, Map.of())
        : new GameStats(m.id(), row.getGamesPlayed(), row.getGamesWon(), row.getPoints(), numericMetrics(row.getMetrics()));
    return new Game(m.id(), m.name(), m.icon(), m.description(), m.experimental(), m.recommended(),
        m.minPlayers(), m.maxPlayers(), m.profileStats(), stats);
  }

  /** Como Node: solo las entradas cuyo valor es un numero JSON. */
  private static Map<String, Number> numericMetrics(Map<String, Object> raw) {
    var metrics = new LinkedHashMap<String, Number>();
    if (raw != null) raw.forEach((key, value) -> {
      if (value instanceof Number number) metrics.put(key, number);
    });
    return metrics;
  }
}
