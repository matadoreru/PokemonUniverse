package es.pokemonuniverse.domain.game.engine;

import io.micronaut.core.annotation.Nullable;
import java.util.List;

/** Fuentes visuales propiedad del servidor; las rutas locales nunca entran en el estado público. */
public interface PokemonVisualCatalog {

  enum Source { SPRITE, ARTWORK }

  /** Caja de los píxeles visibles normalizada a [0, 1] respecto al ancho y alto de la imagen. */
  record AlphaBounds(double x, double y, double width, double height) {}

  /** {@code location}: URL remota de confianza o fuente local opaca que solo entiende el servidor. */
  record Asset(String pokemonId, Source source, String location, @Nullable Integer width, @Nullable Integer height,
      @Nullable AlphaBounds alphaBounds) {}

  @Nullable
  Asset artworkFor(String pokemonId);

  List<String> artworkPokemonIds();
}
