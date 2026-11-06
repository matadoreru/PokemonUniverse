package es.pokemonuniverse.application.daily;

/** Clave HMAC de la semilla del día ({@code pu.auth.secret} en UTF-8); sin ella no se puede calcular el reto. */
public record DailyKey(byte[] bytes) {

  public DailyKey {
    bytes = bytes.clone();
  }

  @Override
  public byte[] bytes() {
    return bytes.clone();
  }
}
