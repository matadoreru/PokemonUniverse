package es.pokemonuniverse.domain.game.engine;

/** Error lanzado por un motor; equivale a un {@code throw new Error(message)} del motor TypeScript. */
public class EngineException extends RuntimeException {

  public EngineException(String message) {
    super(message);
  }
}
