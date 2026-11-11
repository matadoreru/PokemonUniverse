package es.pokemonuniverse.application.datasync.pokemon;

import es.pokemonuniverse.application.datasync.PokemonPaletteCount;
import es.pokemonuniverse.application.ports.SyncHttp;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code pokemon-palette-sync.ts}: calcula y persiste en {@code Pokemon.metadata} la paleta de cada Pokémon por defecto
 * ({@code palette}, {@code paletteWeights}, {@code paletteVersion = 3}, {@code paletteSpriteUrl}). Solo descarga
 * sprites {@code https://raw.githubusercontent.com}; la comprobación se hace sobre la URL guardada y la descarga va a
 * {@code pu.data-sync.sprite-base-url} (la misma en producción, el servidor de fixtures en las pruebas).
 */
public class PokemonPaletteSync implements PokemonPaletteCount {

  private static final Logger LOG = LoggerFactory.getLogger(PokemonPaletteSync.class);
  public static final int PALETTE_VERSION = 3;
  static final String TRUSTED_HOST = "raw.githubusercontent.com";
  static final String UNTRUSTED = "Untrusted sprite source";
  private static final int PARALLEL = 6;
  private static final Pattern COLOR = Pattern.compile("^#[0-9a-f]{6}$", Pattern.CASE_INSENSITIVE);

  /** {@code {processed, updated, skipped, failed}} de {@code syncMissingPokemonPalettes}. */
  public record Result(int processed, int updated, int skipped, int failed) {}

  private enum Outcome { UPDATED, SKIPPED, FAILED }

  private final PokemonCatalogStore store;
  private final SyncHttp http;
  private final String spriteBase;
  private final Clock clock;

  public PokemonPaletteSync(PokemonCatalogStore store, SyncHttp http, String spriteBase, Clock clock) {
    this.store = store;
    this.http = http;
    this.spriteBase = spriteBase.endsWith("/") ? spriteBase.substring(0, spriteBase.length() - 1) : spriteBase;
    this.clock = clock;
  }

  /** {@code countPersistedPokemonPalettes}: Pokémon por defecto con una paleta vigente. */
  @Override
  public long persisted() {
    return store.defaultPokemonByDex().stream().filter(row -> persistedPalette(row.metadata(), row.sprite()) != null)
        .count();
  }

  /**
   * {@code persistedPokemonPalette}: la paleta guardada si es de la versión actual y del mismo sprite, con al menos 3
   * colores {@code #rrggbb} y tantos pesos finitos y positivos como colores; {@code null} si hay que recalcularla.
   */
  public static @Nullable List<String> persistedPalette(@Nullable JsonNode metadata, String sprite) {
    if (metadata == null || !metadata.isObject()) return null;
    var version = metadata.get("paletteVersion");
    var spriteUrl = metadata.get("paletteSpriteUrl");
    var palette = metadata.get("palette");
    if (version == null || !version.isNumber() || version.getNumberValue().doubleValue() != PALETTE_VERSION) return null;
    if (spriteUrl == null || !spriteUrl.isString() || !spriteUrl.getStringValue().equals(sprite)) return null;
    if (palette == null || !palette.isArray()) return null;
    var colors = new ArrayList<String>();
    for (var color : palette.values()) {
      if (color.isString() && COLOR.matcher(color.getStringValue()).matches()) colors.add(color.getStringValue());
    }
    int weights = 0;
    var rawWeights = metadata.get("paletteWeights");
    if (rawWeights != null && rawWeights.isArray()) {
      for (var weight : rawWeights.values()) {
        if (weight.isNumber() && Double.isFinite(weight.getNumberValue().doubleValue())
            && weight.getNumberValue().doubleValue() > 0) {
          weights++;
        }
      }
    }
    return colors.size() >= 3 && weights == colors.size()
        ? List.copyOf(colors.subList(0, Math.min(colors.size(), PaletteExtractor.PALETTE_SIZE))) : null;
  }

  /** {@code syncMissingPokemonPalettes}: lotes de 6 en paralelo; un fallo por fila se registra y no aborta. */
  public Result syncMissing() {
    var rows = store.defaultPokemonByDex();
    int updated = 0;
    int skipped = 0;
    int failed = 0;
    for (int start = 0; start < rows.size(); start += PARALLEL) {
      var batch = rows.subList(start, Math.min(start + PARALLEL, rows.size()));
      for (var outcome : PokemonCatalogSeeder.concurrently(batch, this::process)) {
        switch (outcome) {
          case UPDATED -> updated++;
          case SKIPPED -> skipped++;
          case FAILED -> failed++;
        }
      }
    }
    return new Result(rows.size(), updated, skipped, failed);
  }

  private Outcome process(PokemonCatalogStore.PaletteCandidate row) {
    if (persistedPalette(row.metadata(), row.sprite()) != null) return Outcome.SKIPPED;
    try {
      var source = trustedSprite(row.sprite());
      var palette = PaletteExtractor.extract(http.bytes(download(source), "sprite palette " + row.id()));
      Map<String, JsonNode> metadata = new LinkedHashMap<>();
      if (row.metadata() != null && row.metadata().isObject()) {
        row.metadata().entries().forEach(entry -> metadata.put(entry.getKey(), entry.getValue()));
      }
      metadata.put("palette", JsonNode.createArrayNode(palette.colors().stream().map(JsonNode::createStringNode).toList()));
      metadata.put("paletteWeights",
          JsonNode.createArrayNode(palette.weights().stream().map(JsonNode::createNumberNode).toList()));
      metadata.put("paletteVersion", JsonNode.createNumberNode(PALETTE_VERSION));
      metadata.put("paletteSpriteUrl", JsonNode.createStringNode(row.sprite()));
      store.updateMetadata(row.id(), JsonNode.createObjectNode(metadata), Instant.ofEpochMilli(clock.now()));
      return Outcome.UPDATED;
    } catch (RuntimeException error) {
      LOG.error("[DataSync] palette skipped pokemon={} error={}", row.id(), error.getMessage());
      return Outcome.FAILED;
    }
  }

  /** {@code new URL(sprite)} con protocolo {@code https:} y host {@code raw.githubusercontent.com}. */
  static URI trustedSprite(String sprite) {
    URI uri;
    try {
      uri = new URI(sprite);
    } catch (URISyntaxException e) {
      throw new IllegalArgumentException("Invalid URL");
    }
    if (!uri.isAbsolute() || uri.getHost() == null && uri.getRawAuthority() == null) {
      throw new IllegalArgumentException("Invalid URL");
    }
    var host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
    if (!"https".equalsIgnoreCase(uri.getScheme()) || !host.equals(TRUSTED_HOST)) {
      throw new IllegalStateException(UNTRUSTED);
    }
    return uri;
  }

  private URI download(URI trusted) {
    var query = trusted.getRawQuery() == null ? "" : "?" + trusted.getRawQuery();
    return URI.create(spriteBase + trusted.getRawPath() + query);
  }
}
