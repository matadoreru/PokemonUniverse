package es.pokemonuniverse.adapters.in.rest.rooms;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Imágenes y gritos opacos de una ronda ({@code /sprite} y {@code /audio} de {@code routes.ts}). Sin autenticación,
 * como en Node: el token de la partida y el número de ronda hacen de capacidad; el motor decide la fuente.
 */
@Tag(name = "rooms")
@Controller("/api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}")
@ExecuteOn(TaskExecutors.BLOCKING)
public class GameAssetController {

  private static final String CACHE_CONTROL = "private, max-age=86400, immutable";
  private static final Pattern AUDIO_TYPE = Pattern.compile("^(audio/|application/ogg)");

  private final RoomCoordinator rooms;
  private final GameAssetService assets;

  public GameAssetController(RoomCoordinator rooms, GameAssetService assets) {
    this.rooms = rooms;
    this.assets = assets;
  }

  @Operation(summary = "Imagen de una opción de ronda", operationId = "gameRoundSprite")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary")))
  @ApiResponse(responseCode = "404", description = "No encontrado")
  @ApiResponse(responseCode = "503", description = "Demasiados recursos en curso", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/sprite")
  public HttpResponse<byte[]> sprite(String code, String assetToken, String roundNumber, String optionId) {
    return load(code, assetToken, roundNumber, optionId).map(GameAssetController::ok)
        .orElseGet(HttpResponse::notFound);
  }

  @Operation(summary = "Grito de una opción de ronda", operationId = "gameRoundAudio")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(mediaType = "audio/ogg", schema = @Schema(type = "string", format = "binary")))
  @ApiResponse(responseCode = "404", description = "No encontrado")
  @ApiResponse(responseCode = "415", description = "El recurso no es audio")
  @ApiResponse(responseCode = "503", description = "Demasiados recursos en curso", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/audio")
  public HttpResponse<byte[]> audio(String code, String assetToken, String roundNumber, String optionId) {
    var audio = load(code, assetToken, roundNumber, optionId);
    if (audio.isEmpty()) return HttpResponse.notFound();
    if (!AUDIO_TYPE.matcher(audio.get().contentType()).find()) return HttpResponse.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    return ok(audio.get());
  }

  /** Vacío si la ronda no es un entero o el motor no resuelve el recurso; los fallos del origen se propagan (500). */
  private Optional<LoadedAsset> load(String code, String assetToken, String roundNumber, String optionId) {
    int round;
    try {
      round = Integer.parseInt(roundNumber);
    } catch (NumberFormatException e) {
      return Optional.empty();
    }
    return rooms.gameAsset(code, assetToken, round, optionId).map(assets::load);
  }

  private static HttpResponse<byte[]> ok(LoadedAsset asset) {
    return HttpResponse.ok(asset.body()).contentType(MediaType.of(asset.contentType()))
        .header("Cache-Control", CACHE_CONTROL);
  }
}
