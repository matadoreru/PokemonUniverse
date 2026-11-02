package es.pokemonuniverse.application.datasync.pokemon;

import java.net.URI;

/**
 * Direcciones de PokéAPI. Node usa {@code https://pokeapi.co/api/v2} fijo y sigue las URL absolutas de las respuestas
 * (habilidades, movimientos); aquí la base es configurable ({@code pu.data-sync.pokeapi-base-url}) y esas URL se
 * reescriben sobre ella, de modo que las pruebas sirven las respuestas grabadas sin tocarlas.
 */
public record PokeApiUrls(String base) {

  public static final String DEFAULT_BASE = "https://pokeapi.co/api/v2";

  public PokeApiUrls {
    base = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
  }

  /** {@code <base>/<path>} ({@code path} sin barra inicial, p. ej. {@code pokemon/1}). */
  public URI endpoint(String path) {
    return URI.create(base + "/" + path);
  }

  /** Una URL de una respuesta: si empieza por la base pública, pasa a la configurada. */
  public URI resolve(String absolute) {
    if (absolute.startsWith(DEFAULT_BASE + "/")) return URI.create(base + absolute.substring(DEFAULT_BASE.length()));
    return URI.create(absolute);
  }
}
