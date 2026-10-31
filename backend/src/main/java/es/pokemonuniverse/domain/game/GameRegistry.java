package es.pokemonuniverse.domain.game;

import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Registro de minijuegos exportado desde el registro TypeScript. Clase de dominio pura: la carga desde
 * {@code games/registry.json} vive en {@code adapters.out.resources.ClasspathGameRegistryLoader}.
 */
public final class GameRegistry {

  private final List<GameManifest> games;
  private final Map<String, GameManifest> byId;

  public GameRegistry(List<GameManifest> games) {
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
  }

  /** Orden del fichero exportado (el de {@code gameRegistry.list()} en TypeScript). */
  public List<GameManifest> list() {
    return games;
  }

  public Optional<GameManifest> get(String id) {
    return Optional.ofNullable(byId.get(id));
  }

  /** Recomendados primero; el resto conserva el orden del fichero (ordenacion estable). */
  public List<GameManifest> manifests() {
    return games.stream()
        .sorted(Comparator.comparingInt((GameManifest g) -> Boolean.TRUE.equals(g.recommended()) ? 0 : 1))
        .toList();
  }
}
