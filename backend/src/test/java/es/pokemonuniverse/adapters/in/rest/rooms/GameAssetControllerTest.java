package es.pokemonuniverse.adapters.in.rest.rooms;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.assets.ResourceCapacityException;
import es.pokemonuniverse.application.rooms.GameCatalogProvider;
import es.pokemonuniverse.application.rooms.GameResultsPersister;
import es.pokemonuniverse.application.rooms.HostContentProvider;
import es.pokemonuniverse.application.rooms.RoomAuditSink;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomEvents;
import es.pokemonuniverse.application.rooms.RoomSchedulers;
import es.pokemonuniverse.application.rooms.RoomSettings;
import es.pokemonuniverse.application.rooms.UserGameConfigPreferences;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.EngineException;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.json.JsonMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "GameAssetControllerTest")
class GameAssetControllerTest {

  /** Resoluciones por {@code optionId}; registra las peticiones que llegan al coordinador. */
  @Singleton
  @Replaces(RoomCoordinator.class)
  @Requires(property = "spec.name", value = "GameAssetControllerTest")
  static class FakeCoordinator extends RoomCoordinator {

    final List<String> calls = new ArrayList<>();

    FakeCoordinator(GameRegistry registry, JsonMapper json, RoomEvents events, RoomAuditSink audit,
        GameResultsPersister results, UserGameConfigPreferences userGameConfigs, HostContentProvider hostContent,
        Clock clock, RandomSource random, RoomSchedulers schedulers, RoomSettings settings,
        GameCatalogProvider catalog, GameAssetService assets) {
      super(registry, json, events, audit, results, userGameConfigs, hostContent, clock, random, schedulers, settings,
          catalog, assets, null);
    }

    @Override
    public Optional<AssetResolution> gameAsset(String code, String assetToken, int roundNumber, String assetId) {
      calls.add(code + "/" + assetToken + "/" + roundNumber + "/" + assetId);
      return switch (assetId) {
        case "sprite" -> Optional.of(AssetResolution.original("https://raw.githubusercontent.com/sprite.png"));
        case "silhouette" -> Optional.of(new AssetResolution("https://raw.githubusercontent.com/shape.png",
            AssetResolution.Transform.SILHOUETTE, null, null, null));
        case "cry" -> Optional.of(AssetResolution.original("https://raw.githubusercontent.com/cry.ogg"));
        case "busy" -> Optional.of(AssetResolution.original("https://raw.githubusercontent.com/busy.png"));
        case "broken" -> Optional.of(AssetResolution.original("https://raw.githubusercontent.com/broken.png"));
        default -> Optional.empty();
      };
    }
  }

  /** Origen falso: el proxy no sale a la red en las pruebas. */
  @Singleton
  @Replaces(AssetSourceLoader.class)
  @Requires(property = "spec.name", value = "GameAssetControllerTest")
  static class FakeLoader implements AssetSourceLoader {
    @Override
    public LoadedAsset fetch(String source) {
      return switch (source) {
        case "https://raw.githubusercontent.com/sprite.png" -> new LoadedAsset(new byte[] {1, 2, 3}, "image/png");
        case "https://raw.githubusercontent.com/shape.png" -> new LoadedAsset(SHAPE, "image/png");
        case "https://raw.githubusercontent.com/cry.ogg" -> new LoadedAsset(new byte[] {7, 7}, "audio/ogg");
        case "https://raw.githubusercontent.com/busy.png" -> throw new ResourceCapacityException();
        default -> throw new EngineException("Sprite source returned 404");
      };
    }
  }

  static final byte[] SHAPE = shape();

  private static byte[] shape() {
    var image = new BufferedImage(20, 10, BufferedImage.TYPE_INT_ARGB);
    for (int y = 2; y < 8; y++) for (int x = 2; x < 18; x++) image.setRGB(x, y, 0xFF33AA55);
    try {
      var out = new ByteArrayOutputStream();
      ImageIO.write(image, "png", out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  private static final String BASE = "/api/rooms/ABC123/games/tok/rounds/";

  @Inject @Client("/") HttpClient client;
  @Inject FakeCoordinator coordinator;

  @BeforeEach
  void reset() {
    coordinator.calls.clear();
  }

  private HttpResponse<byte[]> get(String path) {
    try {
      return client.toBlocking().exchange(HttpRequest.GET(path), byte[].class);
    } catch (HttpClientResponseException e) {
      @SuppressWarnings("unchecked")
      var response = (HttpResponse<byte[]>) e.getResponse();
      return response;
    }
  }

  private static String body(HttpResponse<byte[]> response) {
    return response.getBody(byte[].class).map(String::new).orElse("");
  }

  @Test
  void nonIntegerRoundIsEmpty404() {
    var response = get(BASE + "abc/options/sprite/sprite");
    assertEquals(HttpStatus.NOT_FOUND, response.status());
    assertEquals("", body(response));
    assertTrue(coordinator.calls.isEmpty());
  }

  @Test
  void unresolvedAssetIsEmpty404() {
    var response = get(BASE + "2/options/unknown/sprite");
    assertEquals(HttpStatus.NOT_FOUND, response.status());
    assertEquals("", body(response));
    assertEquals(List.of("ABC123/tok/2/unknown"), coordinator.calls);
  }

  @Test
  void spriteIsServedWithPrivateImmutableCache() {
    var response = get(BASE + "1/options/sprite/sprite");
    assertEquals(HttpStatus.OK, response.status());
    assertEquals("image/png", response.header("Content-Type"));
    assertEquals("private, max-age=86400, immutable", response.header("Cache-Control"));
    assertArrayEquals(new byte[] {1, 2, 3}, response.body());
  }

  @Test
  void transformedSpriteIsReencoded() throws IOException {
    var response = get(BASE + "1/options/silhouette/sprite");
    assertEquals(HttpStatus.OK, response.status());
    var image = ImageIO.read(new ByteArrayInputStream(response.body()));
    assertEquals(320, image.getWidth());
    assertEquals(320, image.getHeight());
    assertEquals(0xFF000000, image.getRGB(160, 160));
  }

  @Test
  void audioRequiresAudioContentType() {
    var image = get(BASE + "1/options/sprite/audio");
    assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, image.status());
    assertEquals("", body(image));
    var cry = get(BASE + "1/options/cry/audio");
    assertEquals(HttpStatus.OK, cry.status());
    assertEquals("audio/ogg", cry.header("Content-Type"));
    assertEquals("private, max-age=86400, immutable", cry.header("Cache-Control"));
    assertArrayEquals(new byte[] {7, 7}, cry.body());
  }

  @Test
  void capacityExhaustionIs503() {
    var response = get(BASE + "1/options/busy/sprite");
    assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.status());
    assertEquals("{\"error\":\"El servidor está procesando demasiados recursos. Reintenta en unos segundos.\"}",
        body(response));
  }

  @Test
  void pipelineErrorIs500WithMessage() {
    var response = get(BASE + "1/options/broken/sprite");
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.status());
    assertEquals("{\"error\":\"Sprite source returned 404\"}", body(response));
  }
}
