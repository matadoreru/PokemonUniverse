package es.pokemonuniverse.application.rooms;

import java.util.Collection;

/**
 * Puerto de actividad de sala: la sala o la partida de estas cuentas puede haber cambiado. El coordinador lo llama con
 * el lock de la sala tomado, así que la implementación solo encola trabajo y nunca bloquea ni envía en el momento.
 */
@FunctionalInterface
public interface RoomActivity {

  RoomActivity NONE = userIds -> {};

  void changed(Collection<String> userIds);
}
