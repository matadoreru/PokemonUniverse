package es.pokemonuniverse.adapters.out.storage;

import es.pokemonuniverse.domain.game.assets.AlphaPlane;
import es.pokemonuniverse.domain.game.assets.FocusPoints;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import io.micronaut.core.annotation.Nullable;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code loadPokemonVisualCatalog} de {@code visual-assets.ts}: indexa los PNG del directorio de artworks cuyo nombre
 * es un id del catálogo, valida el PNG y su canal alfa una sola vez y expone la caja alfa normalizada a [0, 1].
 */
public final class FilesystemArtworkCatalog implements PokemonVisualCatalog {

  private static final Logger LOG = LoggerFactory.getLogger(FilesystemArtworkCatalog.class);
  private static final Pattern ARTWORK_NAME = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*\\.png$");
  private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
  /** Proporción mínima de píxeles con alfa > 24. */
  private static final double MIN_VISIBLE_RATIO = 0.002;

  private final Map<String, Asset> artworks;

  public FilesystemArtworkCatalog(Path dir, Set<String> catalogIds) {
    this.artworks = scan(dir, catalogIds);
  }

  /** {@code localArtworkLocation}: fuente opaca que solo entiende el proxy de assets. */
  public static String location(String pokemonId) {
    return "local-artwork:" + pokemonId;
  }

  @Override
  @Nullable
  public Asset artworkFor(String pokemonId) {
    return artworks.get(pokemonId);
  }

  @Override
  public List<String> artworkPokemonIds() {
    return List.copyOf(artworks.keySet());
  }

  private static Map<String, Asset> scan(Path dir, Set<String> catalogIds) {
    List<String> names;
    try (Stream<Path> files = Files.list(dir)) {
      names = files.map(path -> path.getFileName().toString()).sorted().toList();
    } catch (IOException e) {
      LOG.warn("Pokémon artwork directory is unavailable: {}", e.toString());
      return Map.of();
    }
    var artworks = new LinkedHashMap<String, Asset>();
    for (var fileName : names) {
      if (!ARTWORK_NAME.matcher(fileName).matches()) continue;
      var pokemonId = fileName.substring(0, fileName.length() - 4);
      if (!catalogIds.contains(pokemonId)) {
        LOG.warn("Ignoring artwork without catalog key: {}", fileName);
        continue;
      }
      var asset = inspect(dir.resolve(fileName), fileName, pokemonId);
      if (asset != null) artworks.put(pokemonId, asset);
    }
    return artworks;
  }

  @Nullable
  private static Asset inspect(Path file, String fileName, String pokemonId) {
    try {
      var input = Files.readAllBytes(file);
      if (!isPng(input)) return null;
      BufferedImage image = ImageIO.read(new ByteArrayInputStream(input));
      if (image == null || image.getWidth() == 0 || image.getHeight() == 0) return null;
      int width = image.getWidth();
      int height = image.getHeight();
      int[] pixels = image.getRGB(0, 0, width, height, null, 0, width);
      var alpha = new byte[pixels.length];
      int visible = 0;
      for (int index = 0; index < pixels.length; index++) {
        int value = pixels[index] >>> 24;
        alpha[index] = (byte) value;
        if (value > FocusPoints.ALPHA_THRESHOLD) visible++;
      }
      var bounds = FocusPoints.alphaBounds(new AlphaPlane(width, height, alpha));
      if (bounds.isEmpty() || visible < width * height * MIN_VISIBLE_RATIO) return null;
      var box = bounds.get();
      return new Asset(pokemonId, Source.ARTWORK, location(pokemonId), width, height, new AlphaBounds(
          (double) box.x() / width, (double) box.y() / height, (double) box.width() / width,
          (double) box.height() / height));
    } catch (IOException | RuntimeException e) {
      LOG.warn("Ignoring invalid Pokémon artwork {}: {}", fileName, e.getMessage());
      return null;
    }
  }

  private static boolean isPng(byte[] input) {
    if (input.length < PNG_SIGNATURE.length) return false;
    for (int i = 0; i < PNG_SIGNATURE.length; i++) if (input[i] != PNG_SIGNATURE[i]) return false;
    return true;
  }
}
