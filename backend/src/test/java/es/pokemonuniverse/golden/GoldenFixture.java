package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;

/**
 * Formato de {@code packages/shared/golden/types.ts}; las partes opacas se quedan como {@link JsonNode}. Los datos de
 * contexto ({@code hostCustomCategories} … {@code tcgCards}) y {@code catalogPatch} son nulos si el escenario no los trae; los mapas por id de
 * Pokémon se leen como {@link JsonNode} para conservar el orden de la fixture ({@link GoldenContexts}).
 */
@Serdeable
public record GoldenFixture(
    String engineId,
    String scenario,
    long seed,
    String catalog,
    @Nullable Map<String, PalettePatch> catalogPatch,
    List<GamePlayer> players,
    JsonNode config,
    @Nullable List<SubjectiveCategory> hostCustomCategories,
    @Nullable List<WouldYouRatherPromptPair> hostWouldYouRatherPrompts,
    @Nullable JsonNode pokemonVisuals,
    @Nullable JsonNode pokemonAudio,
    @Nullable JsonNode tcgCards,
    @Nullable Long startNow,
    @Nullable String roomCode,
    List<Step> steps,
    Expected expected,
    @Nullable Integer stoppedAt) {

  /**
   * Entrada de {@code catalogPatch} ({@code GoldenCatalogPatch} de {@code types.ts}): paleta que {@link GoldenCatalogs}
   * superpone a la fila del Pokémon antes de construir el catálogo.
   */
  @Serdeable
  public record PalettePatch(List<String> palette, List<Double> paletteWeights) {}

  /**
   * {@code kind}: {@code action} (playerId, action), {@code timeout}, {@code presence} (players) o {@code asset}
   * (assetToken, roundNumber, assetId).
   */
  @Serdeable
  public record Step(String kind, @Nullable String playerId, @Nullable JsonNode action,
      @Nullable List<GamePlayer> players, @Nullable String assetToken, @Nullable Integer roundNumber,
      @Nullable String assetId, long now) {}

  @Serdeable
  public record Snapshot(@Nullable JsonNode lifecycle, @Nullable JsonNode publicState, @Nullable JsonNode playerStates,
      boolean finished) {}

  /**
   * O {@code threw}, o {@code invalidAction: true}, o {@code resolution} (pasos {@code asset}), o {@code snapshot} con
   * {@code accepted}/{@code error} opcionales (ausentes en TS = nulos). Serde lee igual {@code resolution: null} que la
   * clave ausente; su presencia la garantiza el tipo de paso: el runner siempre la escribe en los pasos {@code asset}.
   */
  @Serdeable
  public record StepResult(@Nullable Boolean accepted, @Nullable String error, @Nullable Snapshot snapshot,
      @Nullable JsonNode resolution, @Nullable String threw, @Nullable Boolean invalidAction) {}

  @Serdeable
  public record Expected(JsonNode configNormalized, Snapshot initial, Snapshot afterStart, List<StepResult> afterSteps,
      @Nullable JsonNode results) {}

  /** Entrada de {@code config-cases.json}: {@code normalized} solo existe si {@code valid}. */
  @Serdeable
  public record ConfigCase(JsonNode input, boolean valid, @Nullable JsonNode normalized) {}
}
