package es.pokemonuniverse.domain.profile;

/** Ajuste «Perfil visible para» de una cuenta: quién ve su nivel, sus estadísticas y sus logros. */
public enum ProfileVisibility {
  EVERYONE,
  FRIENDS,
  NOBODY;

  /**
   * Si quien mira ve el perfil completo. El dueño siempre; con {@link #FRIENDS}, solo un amigo aceptado; con
   * {@link #NOBODY}, nadie más (tampoco los amigos).
   */
  public boolean visibleTo(boolean owner, boolean friend) {
    if (owner) return true;
    return switch (this) {
      case EVERYONE -> true;
      case FRIENDS -> friend;
      case NOBODY -> false;
    };
  }
}
