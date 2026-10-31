package es.pokemonuniverse.domain.game.engine;

import io.micronaut.core.annotation.Nullable;
import java.util.List;

/** Referencias de gritos respaldadas por PostgreSQL; las URL de origen nunca entran en las proyecciones. */
public interface PokemonAudioCatalog {

  enum CryVersion { LATEST, LEGACY }

  @Nullable
  String cryFor(String pokemonId, CryVersion version);

  /** {@code version} nula equivale al parámetro opcional omitido de TypeScript. */
  List<String> pokemonIds(@Nullable CryVersion version);
}
