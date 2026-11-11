package es.pokemonuniverse.application.ports;

import io.micronaut.json.tree.JsonNode;
import java.net.URI;

/**
 * Descargas externas del data-sync (PokéAPI, sprites y TCGdex), con plazo, tamaño máximo y reintentos. Los juegos nunca
 * dependen de ellas. {@code label} nombra el recurso en los mensajes de error.
 */
public interface SyncHttp {

  /** Descarga y parsea JSON. */
  JsonNode json(URI uri, String label);

  /** Descarga binaria (sprites). */
  byte[] bytes(URI uri, String label);

  /** Espera entre intentos; inyectada para que las pruebas no duerman. */
  @FunctionalInterface
  interface Sleeper {
    void sleep(long millis) throws InterruptedException;
  }

  /** Fallo de una petición; {@link #status()} es el código HTTP o 0 si no hubo respuesta válida. */
  class SyncHttpException extends RuntimeException {

    private final int status;

    public SyncHttpException(String message) {
      this(message, 0);
    }

    public SyncHttpException(String message, int status) {
      super(message);
      this.status = status;
    }

    public int status() {
      return status;
    }
  }
}
