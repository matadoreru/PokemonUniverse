package es.pokemonuniverse.domain.game;

import io.micronaut.core.type.Argument;
import io.micronaut.serde.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.InputStream;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Registro de minijuegos cargado de {@code games/registry.json} (exportado desde el registro TypeScript). */
@Singleton
public class GameRegistry {

  static final String RESOURCE = "games/registry.json";

  private final ObjectMapper mapper;
  private List<GameManifest> games = List.of();
  private Map<String, GameManifest> byId = Map.of();

  public GameRegistry(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  @PostConstruct
  void init() {
    try (InputStream in = GameRegistry.class.getClassLoader().getResourceAsStream(RESOURCE)) {
      if (in == null) {
        throw new IllegalStateException("Falta el recurso " + RESOURCE + ". Ejecuta npm run registry:export");
      }
      games = load(mapper, in);
    } catch (IOException e) {
      throw new IllegalStateException("No se pudo leer " + RESOURCE, e);
    }
    var index = new LinkedHashMap<String, GameManifest>();
    games.forEach(game -> index.put(game.id(), game));
    byId = index;
  }

  static List<GameManifest> load(ObjectMapper mapper, InputStream in) throws IOException {
    var loaded = List.copyOf(mapper.readValue(in, Argument.listOf(GameManifest.class)));
    var seen = new java.util.HashSet<String>();
    for (var game : loaded) {
      if (!seen.add(game.id())) {
        throw new IllegalStateException("Minijuego duplicado en el registro: " + game.id());
      }
    }
    return loaded;
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
