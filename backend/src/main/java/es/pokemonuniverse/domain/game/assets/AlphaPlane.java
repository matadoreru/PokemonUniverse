package es.pokemonuniverse.domain.game.assets;

/** Canal alfa de una imagen, fila a fila ({@code AlphaPlane} de {@code zoomed-pokemon/rules.ts}); valores sin signo. */
public record AlphaPlane(int width, int height, byte[] alpha) {

  public AlphaPlane {
    if (width < 0 || height < 0 || alpha.length != width * height) {
      throw new IllegalArgumentException("El plano alfa no coincide con sus dimensiones");
    }
  }

  /** Alfa en [0, 255] del píxel ({@code x}, {@code y}). */
  public int at(int x, int y) {
    return alpha[y * width + x] & 0xFF;
  }
}
