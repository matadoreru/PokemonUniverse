package es.pokemonuniverse.application.achievements;

import es.pokemonuniverse.adapters.out.persistence.UserAchievementEntity;
import es.pokemonuniverse.adapters.out.persistence.UserAchievementRepository;
import es.pokemonuniverse.domain.achievements.AchievementCatalog;
import es.pokemonuniverse.domain.achievements.AchievementFamily;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;

/** Catálogo de logros con lo que una cuenta lleva desbloqueado. */
@Singleton
public class AchievementService {

  static final String SECRET_NAME = "Logro secreto";
  static final String SECRET_DESCRIPTION = "Sigue jugando para descubrirlo.";

  private final AchievementCatalog catalog;
  private final UserAchievementRepository unlocked;

  public AchievementService(AchievementCatalog catalog, UserAchievementRepository unlocked) {
    this.catalog = catalog;
    this.unlocked = unlocked;
  }

  /** Todos los logros en el orden del catálogo; un id guardado que ya no existe en él se ignora. */
  public List<AchievementView> listFor(String userId) {
    var dates = new HashMap<String, Instant>();
    for (UserAchievementEntity row : unlocked.findByUserId(userId)) {
      dates.put(row.getAchievementId(), row.getUnlockedAt());
    }
    return catalog.all().stream().map(a -> {
      var at = dates.get(a.id());
      boolean hidden = a.family() == AchievementFamily.SECRET && at == null;
      return new AchievementView(a.id(), a.family(), a.gameId(), hidden ? SECRET_NAME : a.name(),
          hidden ? SECRET_DESCRIPTION : a.description(), at);
    }).toList();
  }
}
