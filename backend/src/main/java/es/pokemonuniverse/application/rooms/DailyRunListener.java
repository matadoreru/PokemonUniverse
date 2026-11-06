package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.room.DailyRoom;
import java.util.concurrent.CompletableFuture;

/**
 * Puerto de las partidas del reto diario. El coordinador lo llama con el lock de la sala tomado: cada método solo
 * trabaja en memoria y deja la escritura en BD y los avisos en el futuro que devuelve, que corre fuera del lock.
 */
public interface DailyRunListener {

  DailyRunListener NONE = new DailyRunListener() {
    @Override
    public void observe(DailyRoom daily, Object publicState) {}

    @Override
    public CompletableFuture<Void> finished(DailyRoom daily, GameResults results) {
      return CompletableFuture.completedFuture(null);
    }

    @Override
    public CompletableFuture<Void> abandoned(DailyRoom daily) {
      return CompletableFuture.completedFuture(null);
    }
  };

  /** En cada difusión de la partida viva y una vez más al terminar: apunta las rondas cerradas en {@code daily}. */
  void observe(DailyRoom daily, Object publicState);

  /** La partida terminó: fija {@code daily.outcome} antes de volver y guarda el resultado en segundo plano. */
  CompletableFuture<Void> finished(DailyRoom daily, GameResults results);

  /** La sala desapareció con la partida a medias (salida o gracia de reconexión vencida). */
  CompletableFuture<Void> abandoned(DailyRoom daily);
}
