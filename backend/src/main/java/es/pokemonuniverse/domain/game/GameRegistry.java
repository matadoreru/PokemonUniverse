package es.pokemonuniverse.domain.game;

import es.pokemonuniverse.domain.game.engine.GameEngine;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Registro de minijuegos: los manifiestos de {@code games/registry.json} y el motor de cada uno. Clase de dominio pura:
 * la carga vive en {@code adapters.out.resources.ClasspathGameRegistryLoader}, que falla al arrancar si algún manifiesto
 * no tiene motor. Los tests pueden construir registros sin motores o con solo algunos.
 */
public final class GameRegistry {

  private final List<GameManifest> games;
  private final Map<String, GameManifest> byId;
  private final Map<String, GameEngine<?, ?, ?, ?>> engines;

  public GameRegistry(List<GameManifest> games) {
    this(games, Map.of());
  }

  /** Cada motor debe corresponder a un manifiesto del registro con el mismo id. */
  public GameRegistry(List<GameManifest> games, Map<String, GameEngine<?, ?, ?, ?>> engines) {
    this.games = List.copyOf(games);
    var seen = new HashSet<String>();
    var index = new LinkedHashMap<String, GameManifest>();
    for (var game : this.games) {
      if (!seen.add(game.id())) {
        throw new IllegalStateException("Minijuego duplicado en el registro: " + game.id());
      }
      index.put(game.id(), game);
    }
    this.byId = index;
    for (var entry : engines.entrySet()) {
      if (!index.containsKey(entry.getKey()) || !entry.getKey().equals(entry.getValue().manifest().id())) {
        throw new IllegalStateException("Motor sin manifiesto coincidente en el registro: " + entry.getKey());
      }
    }
    this.engines = Map.copyOf(engines);
  }

  /** Motor del minijuego, si existe. */
  public Optional<GameEngine<?, ?, ?, ?>> engine(String id) {
    return id == null ? Optional.empty() : Optional.ofNullable(engines.get(id));
  }

  /** Copia del registro con los motores dados. */
  public GameRegistry withEngines(Map<String, GameEngine<?, ?, ?, ?>> value) {
    return new GameRegistry(games, value);
  }

  /** Orden del fichero exportado (el de {@code gameRegistry.list()} en TypeScript). */
  public List<GameManifest> list() {
    return games;
  }

  public Optional<GameManifest> get(String id) {
    return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
  }

  /** Recomendados primero; el resto conserva el orden del fichero (ordenacion estable). */
  public List<GameManifest> manifests() {
    return games.stream()
        .sorted(Comparator.comparingInt((GameManifest g) -> Boolean.TRUE.equals(g.recommended()) ? 0 : 1))
        .toList();
  }
}
