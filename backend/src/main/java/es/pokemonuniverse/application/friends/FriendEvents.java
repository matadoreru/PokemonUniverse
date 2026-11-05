package es.pokemonuniverse.application.friends;

/**
 * Puerto de avisos: la amistad o la solicitud entre {@code a} y {@code b} ha cambiado (creada, aceptada o borrada).
 * Se llama después de confirmar la transacción.
 */
@FunctionalInterface
public interface FriendEvents {

  void changed(String a, String b);
}
