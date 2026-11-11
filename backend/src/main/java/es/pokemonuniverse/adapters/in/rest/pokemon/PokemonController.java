package es.pokemonuniverse.adapters.in.rest.pokemon;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import es.pokemonuniverse.application.pokemon.PokemonSearchQuery;
import es.pokemonuniverse.application.pokemon.PokemonSpriteService;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.annotation.QueryValue;
import io.micronaut.json.JsonMapper;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Catálogo reducido del buscador y sus miniaturas. {@code GET /api/pokemon} (el catálogo completo) ya no existe: con
 * número, generación, tipos y estadísticas daba la respuesta de varios minijuegos.
 */
@Tag(name = "pokemon")
@Controller("/api/pokemon")
@ExecuteOn(TaskExecutors.BLOCKING)
public class PokemonController {

  private static final Pattern INTEGER = Pattern.compile("[+-]?\\d+");
  /** Revalida siempre: una recarga del catálogo cambia el ETag y se ve en la siguiente petición. */
  private static final String SELECTOR_CACHE_CONTROL = "no-cache";
  private static final String SPRITE_CACHE_CONTROL = "public, max-age=86400";
  private static final Pattern IMAGE_TYPE = Pattern.compile("^image/");

  private final PokemonCatalogService service;
  private final PokemonSpriteService sprites;
  private final JsonMapper json;

  public PokemonController(PokemonCatalogService service, PokemonSpriteService sprites, JsonMapper json) {
    this.service = service;
    this.sprites = sprites;
    this.json = json;
  }

  @Operation(summary = "Catálogo del buscador de Pokémon", operationId = "listSelectorPokemon")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(mediaType = MediaType.APPLICATION_JSON, schema = @Schema(implementation = PokemonSelectorResponse.class)))
  @ApiResponse(responseCode = "304", description = "Sin cambios desde el ETag de If-None-Match")
  @Get(value = "/selector", produces = MediaType.APPLICATION_JSON)
  public HttpResponse<byte[]> selector(@QueryValue(defaultValue = "") @Nullable String generations,
      @QueryValue(defaultValue = "") @Nullable String includeForms,
      @Header("If-None-Match") @Nullable String ifNoneMatch) {
    var query = new PokemonSearchQuery(parseGenerations(generations), "true".equals(includeForms));
    var body = serialize(new PokemonSelectorResponse(
        service.selectorSearch(query).stream().map(SelectorPokemon::from).toList()));
    var etag = etag(body);
    if (matches(ifNoneMatch, etag)) {
      return HttpResponse.<byte[]>notModified().header("ETag", etag).header("Cache-Control", SELECTOR_CACHE_CONTROL);
    }
    return HttpResponse.ok(body).contentType(MediaType.APPLICATION_JSON_TYPE).header("ETag", etag)
        .header("Cache-Control", SELECTOR_CACHE_CONTROL);
  }

  @Operation(summary = "Miniatura de un Pokémon del buscador", operationId = "pokemonSprite")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary")))
  @ApiResponse(responseCode = "404", description = "No encontrado")
  @ApiResponse(responseCode = "502", description = "El origen no devolvió una imagen")
  @ApiResponse(responseCode = "503", description = "Demasiados recursos en curso", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/{id}/sprite")
  public HttpResponse<byte[]> sprite(String id) {
    var pokemon = service.selectorCatalog().byId(id);
    if (pokemon.isEmpty()) return HttpResponse.notFound();
    var asset = sprites.sprite(pokemon.get());
    // Solo se reenvían imágenes: cualquier otra cosa del origen (HTML de error, audio…) es un fallo de la pasarela.
    if (!IMAGE_TYPE.matcher(asset.contentType()).find()) return HttpResponse.status(HttpStatus.BAD_GATEWAY);
    return HttpResponse.ok(asset.body()).contentType(MediaType.of(asset.contentType()))
        .header("Cache-Control", SPRITE_CACHE_CONTROL);
  }

  /** Solo enteros 1 a 9, sin duplicados; el resto de valores se ignora. */
  static List<Integer> parseGenerations(String raw) {
    return Arrays.stream(raw.split(","))
        .map(String::trim)
        .filter(t -> INTEGER.matcher(t).matches())
        .map(t -> {
          try {
            return Integer.valueOf(t.startsWith("+") ? t.substring(1) : t);
          } catch (NumberFormatException e) {
            return 0;
          }
        })
        .filter(n -> n >= 1 && n <= 9)
        .distinct()
        .toList();
  }

  private byte[] serialize(PokemonSelectorResponse response) {
    try {
      return json.writeValueAsBytes(response);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** ETag débil con los 16 primeros hexadecimales del SHA-256 del JSON servido. */
  static String etag(byte[] body) {
    try {
      var digest = MessageDigest.getInstance("SHA-256").digest(body);
      return "W/\"" + HexFormat.of().formatHex(digest).substring(0, 16) + "\"";
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  /** Comparación débil de {@code If-None-Match} (RFC 9110): lista separada por comas, {@code W/} ignorado y {@code *}. */
  static boolean matches(@Nullable String ifNoneMatch, String etag) {
    if (ifNoneMatch == null || ifNoneMatch.isBlank()) return false;
    var opaque = etag.substring(2);
    for (var candidate : ifNoneMatch.split(",")) {
      var tag = candidate.trim();
      if (tag.equals("*")) return true;
      if (tag.startsWith("W/")) tag = tag.substring(2);
      if (tag.equals(opaque)) return true;
    }
    return false;
  }

  @Serdeable
  public record PokemonSelectorResponse(List<SelectorPokemon> pokemon) {}
}
