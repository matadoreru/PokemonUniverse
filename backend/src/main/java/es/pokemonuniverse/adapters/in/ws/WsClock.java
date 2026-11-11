package es.pokemonuniverse.adapters.in.ws;

import jakarta.inject.Singleton;

/**
 * Reloj del límite de eventos de {@code /ws}, aparte del {@code Clock} de la aplicación: los tests del {@code /ws}
 * desplazan este último para jugar el reto diario en otra fecha y avanzar los plazos, y el límite necesita su propio
 * reloj manual para no depender ni del tiempo real ni de esos saltos.
 */
@Singleton
public class WsClock {

  public long now() {
    return System.currentTimeMillis();
  }
}
