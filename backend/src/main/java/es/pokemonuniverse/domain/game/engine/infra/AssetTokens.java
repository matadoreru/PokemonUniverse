package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GameContext;

/**
 * Token y rutas opacas de los recursos de ronda (constraint 15 de la etapa 2B). Las rutas son lo único que llega a la
 * proyección; la fuente real solo la conoce {@code resolveAsset}.
 */
public final class AssetTokens {

  private AssetTokens() {}

  /**
   * {@code `${context.now.toString(36)}-${randomToken}`} con {@code randomToken} = tres
   * {@code Math.floor(context.random() * 0x1_0000_0000).toString(36)} unidos con {@code -}, extraídos en ese orden.
   */
  public static String randomToken(GameContext context) {
    var token = new StringBuilder(Long.toString(context.now(), 36));
    for (int index = 0; index < 3; index++) {
      token.append('-').append(Long.toString((long) Math.floor(context.random().getAsDouble() * 4294967296.0), 36));
    }
    return token.toString();
  }

  /**
   * {@code /api/rooms/${encodeURIComponent(roomCode)}/games/${assetToken}/rounds/${roundNumber}/options/${assetId}/}
   * seguido de {@code media} ({@code sprite} o {@code audio}).
   * {@code roomCode} ya trae el respaldo de cada motor ({@code ?? 'opaque'} o la condición de {@code shiny-vote}).
   */
  public static String roundAssetPath(String roomCode, String assetToken, int roundNumber, String assetId,
      String media) {
    return "/api/rooms/" + JsUrl.encodeURIComponent(roomCode) + "/games/" + assetToken + "/rounds/" + roundNumber
        + "/options/" + assetId + "/" + media;
  }
}
