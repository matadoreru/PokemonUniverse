package es.pokemonuniverse.application.achievements;

/**
 * Puerto del aviso {@code achievements:unlocked}: se llama solo después de confirmar la transacción de resultados, con
 * lo nuevo de una cuenta registrada.
 */
public interface AchievementEvents {

  /** No avisa a nadie. */
  AchievementEvents NONE = (userId, payload) -> {};

  void unlocked(String userId, AchievementsUnlocked payload);
}
