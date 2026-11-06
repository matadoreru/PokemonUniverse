package es.pokemonuniverse.config;

import es.pokemonuniverse.domain.achievements.AchievementCatalog;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;

/** Crea el catálogo de logros a partir de los manifiestos del registro, en el orden de {@code registry.json}. */
@Factory
public class AchievementBeans {

  @Singleton
  AchievementCatalog achievementCatalog(GameRegistry games) {
    return AchievementCatalog.of(games.list());
  }
}
