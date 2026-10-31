package es.pokemonuniverse.adapters.in.rest.ratelimit;

import io.micronaut.http.HttpRequest;

/** Equivalente a {@code trust proxy: 1} de Express: confía solo en el último salto de X-Forwarded-For. */
final class ClientAddress {

  static final String UNKNOWN = "unknown";

  private ClientAddress() {}

  static String of(HttpRequest<?> request) {
    String forwarded = request.getHeaders().get("X-Forwarded-For");
    if (forwarded != null) {
      String last = forwarded.substring(forwarded.lastIndexOf(',') + 1).trim();
      if (!last.isEmpty()) {
        return last;
      }
    }
    var remote = request.getRemoteAddress();
    return remote == null || remote.getAddress() == null ? UNKNOWN : remote.getAddress().getHostAddress();
  }
}
