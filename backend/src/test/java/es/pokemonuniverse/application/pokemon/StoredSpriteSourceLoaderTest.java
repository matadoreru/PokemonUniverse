package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.ports.SpriteStorage;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class StoredSpriteSourceLoaderTest {

  private static final String SOURCE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png";
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 7, 7};

  private static final class MemoryStorage implements SpriteStorage {
    final Map<String, byte[]> files = new HashMap<>();
    boolean failReads;
    boolean failWrites;
    final AtomicInteger writes = new AtomicInteger();

    @Override
    public Optional<byte[]> read(String name) {
      if (failReads) throw new IllegalStateException("disco ilegible");
      return Optional.ofNullable(files.get(name));
    }

    @Override
    public void write(String name, byte[] body) {
      writes.incrementAndGet();
      if (failWrites) throw new IllegalStateException("disco lleno");
      files.put(name, body);
    }

    @Override
    public String location() {
      return "/app/.data/sprite-cache";
    }
  }

  private static final class Origin implements AssetSourceLoader {
    final AtomicInteger calls = new AtomicInteger();
    LoadedAsset response = new LoadedAsset(PNG, "image/png");

    @Override
    public LoadedAsset fetch(String source) {
      calls.incrementAndGet();
      return response;
    }
  }

  @Test
  void aMissDownloadsAndStoresAndTheNextLoadSkipsTheOrigin() {
    var storage = new MemoryStorage();
    var origin = new Origin();
    var loader = new StoredSpriteSourceLoader(origin, storage);

    assertArrayEquals(PNG, loader.fetch(SOURCE).body());
    assertEquals(1, storage.files.size());
    var name = storage.files.keySet().iterator().next();
    assertTrue(name.matches("[0-9a-f]{64}\\.png"), name);

    // Un proceso nuevo (caché en memoria vacía) sobre el mismo disco no vuelve al origen.
    var hit = new StoredSpriteSourceLoader(origin, storage).fetch(SOURCE);
    assertArrayEquals(PNG, hit.body());
    assertEquals("image/png", hit.contentType());
    assertEquals(1, origin.calls.get());
  }

  @Test
  void theKeyIsTheSourceSoAChangedUrlIsDownloadedAgain() {
    var storage = new MemoryStorage();
    var origin = new Origin();
    var loader = new StoredSpriteSourceLoader(origin, storage);

    loader.fetch(SOURCE);
    loader.fetch(SOURCE.replace("1.png", "2.png"));

    assertEquals(2, origin.calls.get());
    assertEquals(2, storage.files.size());
  }

  @Test
  void aCorruptFileFallsBackToTheOriginAndIsRewritten() {
    var storage = new MemoryStorage();
    var origin = new Origin();
    var loader = new StoredSpriteSourceLoader(origin, storage);
    loader.fetch(SOURCE);
    var name = storage.files.keySet().iterator().next();
    storage.files.put(name, new byte[] {'<', 'h', 't', 'm', 'l'});

    assertArrayEquals(PNG, loader.fetch(SOURCE).body());
    assertEquals(2, origin.calls.get());
    assertArrayEquals(PNG, storage.files.get(name));
  }

  @Test
  void aFailedWriteWarnsOnceAndStopsWritingButKeepsReading() {
    var storage = new MemoryStorage();
    var origin = new Origin();
    var warnings = new ArrayList<String>();
    var loader = new StoredSpriteSourceLoader(origin, storage, warnings::add);
    loader.fetch(SOURCE);
    storage.failWrites = true;

    for (int i = 2; i < 50; i++) loader.fetch(SOURCE.replace("1.png", i + ".png"));

    assertEquals(1, warnings.size());
    assertTrue(warnings.get(0).contains("/app/.data/sprite-cache"), warnings.get(0));
    assertTrue(warnings.get(0).contains("SPRITE_CACHE_DIR"), warnings.get(0));
    assertEquals(2, storage.writes.get(), "tras el primer fallo no se vuelve a escribir");
    // Lo que ya estaba en disco se sigue leyendo sin ir al origen.
    var before = origin.calls.get();
    loader.fetch(SOURCE);
    assertEquals(before, origin.calls.get());
  }

  @Test
  void aContentTypeWithParametersIsStillPersisted() {
    var storage = new MemoryStorage();
    var origin = new Origin();
    origin.response = new LoadedAsset(PNG, "Image/PNG; charset=binary");

    new StoredSpriteSourceLoader(origin, storage).fetch(SOURCE);

    assertEquals(1, storage.files.size());
  }

  @Test
  void onlyPngImagesArePersisted() {
    var storage = new MemoryStorage();
    var origin = new Origin();
    origin.response = new LoadedAsset("<html>".getBytes(), "text/html");
    var loader = new StoredSpriteSourceLoader(origin, storage);

    assertEquals("text/html", loader.fetch(SOURCE).contentType());
    origin.response = new LoadedAsset(new byte[] {1, 2, 3}, "image/png");
    loader.fetch(SOURCE);

    assertTrue(storage.files.isEmpty());
  }

  @Test
  void diskFailuresNeverBreakTheDownload() {
    var storage = new MemoryStorage();
    storage.failReads = true;
    storage.failWrites = true;
    var origin = new Origin();

    assertArrayEquals(PNG, new StoredSpriteSourceLoader(origin, storage).fetch(SOURCE).body());
    assertEquals(1, origin.calls.get());
  }
}
