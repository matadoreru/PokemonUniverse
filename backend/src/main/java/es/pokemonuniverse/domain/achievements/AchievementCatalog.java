package es.pokemonuniverse.domain.achievements;

import es.pokemonuniverse.domain.game.GameManifest;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * Catálogo declarativo de logros, construido a partir de los manifiestos del registro: 10 generales, una
 * victoria por minijuego más un específico en los seis juegos con modos, y 4 secretos con ids neutros.
 *
 * <p>Orden: generales, de minijuego (en el orden de los manifiestos, la victoria antes que el específico) y secretos.
 * Las victorias se evalúan con {@code winsByGame}, para todos los juegos; los específicos solo cuando termina una
 * partida de su juego.
 */
public final class AchievementCatalog {

  private static final LocalTime NIGHT_START = LocalTime.of(3, 0);
  private static final LocalTime NIGHT_END = LocalTime.of(5, 0);
  private static final int LOYAL_GAMES = 10;

  private final List<Achievement> all;
  private final Map<String, Achievement> byId;

  private AchievementCatalog(List<Achievement> all) {
    this.all = List.copyOf(all);
    var index = new LinkedHashMap<String, Achievement>();
    for (var achievement : this.all) {
      if (index.put(achievement.id(), achievement) != null) {
        throw new IllegalStateException("Logro duplicado en el catálogo: " + achievement.id());
      }
    }
    this.byId = index;
  }

  /** Catálogo para estos manifiestos, en su orden. */
  public static AchievementCatalog of(List<GameManifest> manifests) {
    var list = new ArrayList<Achievement>();
    list.add(general("general.first-game", "Primera partida", "Termina tu primera partida.",
        f -> f.gamesPlayed() >= 1));
    list.add(general("general.games-10", "Habitual", "Termina 10 partidas.", f -> f.gamesPlayed() >= 10));
    list.add(general("general.games-50", "Veterano", "Termina 50 partidas.", f -> f.gamesPlayed() >= 50));
    list.add(general("general.games-100", "Leyenda de la sala", "Termina 100 partidas.",
        f -> f.gamesPlayed() >= 100));
    list.add(general("general.first-win", "Primera victoria", "Gana una partida.", f -> f.gamesWon() >= 1));
    list.add(general("general.wins-10", "Ganador nato", "Gana 10 partidas.", f -> f.gamesWon() >= 10));
    list.add(general("general.wins-50", "Campeón", "Gana 50 partidas.", f -> f.gamesWon() >= 50));
    list.add(general("general.level-5", "Nivel 5", "Llega al nivel 5.", f -> f.level() >= 5));
    list.add(general("general.level-10", "Nivel 10", "Llega al nivel 10.", f -> f.level() >= 10));
    list.add(general("general.level-20", "Nivel 20", "Llega al nivel 20.", f -> f.level() >= 20));

    for (var manifest : manifests) {
      String gameId = manifest.id();
      list.add(new Achievement("game." + gameId + ".win", AchievementFamily.GAME, gameId,
          "Gana en " + manifest.name(), "Gana una partida de " + manifest.name() + ".",
          f -> f.winsByGame().getOrDefault(gameId, 0) >= 1));
      specific(gameId).ifPresent(list::add);
    }

    list.add(secret("secret.1", "Foto finish", "Termina empatado en el primer puesto.",
        f -> f.individualRanking() && f.playerCount() >= 2 && f.sharedFirst()));
    list.add(secret("secret.2", "Fiel", "Juega 10 partidas seguidas del mismo minijuego.",
        f -> f.sameGameStreak() >= LOYAL_GAMES));
    list.add(secret("secret.3", "Búho nocturno", "Termina una partida entre las 3:00 y las 5:00.", f -> {
      var time = f.endedAt().toLocalTime();
      return !time.isBefore(NIGHT_START) && time.isBefore(NIGHT_END);
    }));
    list.add(secret("secret.4", "Lo importante es participar",
        "Queda último con 0 puntos en una partida de 4 o más jugadores.",
        f -> f.individualRanking() && f.playerCount() >= 4 && f.standing().points() == 0 && f.lastPlace()));
    return new AchievementCatalog(list);
  }

  /** El específico de un juego con modos; se evalúa solo con las métricas y el modo de una partida de ese juego. */
  private static Optional<Achievement> specific(String gameId) {
    return Optional.ofNullable(switch (gameId) {
      case "pokedex-distance" -> game(gameId, "bullseye", "Diana",
          "Clava la distancia en una ronda de Pokédex Distance.", f -> f.metric("exactHits") >= 1);
      case "higher-lower" -> game(gameId, "endless-10", "Imparable", "Encadena 10 aciertos en Racha infinita.",
          f -> "ENDLESS".equals(f.mode()) && f.metric("endlessBestStreak") >= 10);
      case "shiny-vote" -> game(gameId, "survival-10", "Ojo de halcón",
          "Supera 10 rondas en Supervivencia de Shiny Quiz.",
          f -> "SURVIVAL".equals(f.mode()) && f.metric("correctVotes") >= 10);
      case "learnset-guess" -> game(gameId, "first-group", "A la primera",
          "Acierta en Revelación manual viendo un solo grupo de movimientos.",
          f -> "MANUAL_REVEAL".equals(f.mode()) && f.metric("initialSolves") >= 1);
      case "type-duel" -> game(gameId, "coop-20", "Trabajo en equipo",
          "En Cooperativo, encontrad entre todos 20 Pokémon en una partida.",
          f -> "COOP".equals(f.mode()) && f.metric("groupTotal") >= 20);
      case "pokemon-impostor" -> game(gameId, "disguise", "Maestro del disfraz",
          "Gana una partida de Pokémon Impostor siendo el impostor.", f -> f.metric("wonAsImpostor") >= 1);
      default -> null;
    });
  }

  private static Achievement general(String id, String name, String description,
      Predicate<AchievementFacts> condition) {
    return new Achievement(id, AchievementFamily.GENERAL, null, name, description, condition);
  }

  private static Achievement secret(String id, String name, String description,
      Predicate<AchievementFacts> condition) {
    return new Achievement(id, AchievementFamily.SECRET, null, name, description, condition);
  }

  /** Específico: su condición solo cuenta si la partida que termina es de su juego. */
  private static Achievement game(String gameId, String suffix, String name, String description,
      Predicate<AchievementFacts> condition) {
    Predicate<AchievementFacts> ofItsGame = f -> gameId.equals(f.gameId());
    return new Achievement("game." + gameId + "." + suffix, AchievementFamily.GAME, gameId, name, description,
        ofItsGame.and(condition));
  }

  /** Todos los logros, en el orden del catálogo. */
  public List<Achievement> all() {
    return all;
  }

  public Optional<Achievement> byId(String id) {
    return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
  }

  /** Ids de los logros cuya condición se cumple con estos hechos, en el orden del catálogo. */
  public List<String> met(AchievementFacts facts) {
    return all.stream().filter(a -> a.condition().test(facts)).map(Achievement::id).toList();
  }
}
