package es.pokemonuniverse.application.datasync.pokemon;

import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import io.micronaut.core.annotation.Nullable;
import java.util.List;

/**
 * {@code extractSpanishAbilityName} de {@code ability-source.ts}: el nombre oficial en español de PokéAPI, sin traducir
 * identificadores. Solo cuenta la primera entrada {@code es}; si queda vacía tras {@code trim} no hay nombre.
 */
public final class AbilityNameExtractor {

  private AbilityNameExtractor() {}

  public static @Nullable String spanishName(List<PokeApiPayloads.LocalizedName> names) {
    for (var entry : names) {
      if (!"es".equals(entry.language())) continue;
      var name = JsStrings.trim(entry.name());
      return name.isEmpty() ? null : name;
    }
    return null;
  }
}
