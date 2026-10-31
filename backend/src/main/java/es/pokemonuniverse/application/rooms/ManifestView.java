package es.pokemonuniverse.application.rooms;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.GameManifest;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/** {@code MiniGameManifest} ({@code { ...game.manifest }}): el manifiesto sin {@code defaultConfig}. */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ManifestView(String id, String name, String icon, String description, @Nullable Boolean experimental,
    @Nullable Boolean recommended, int minPlayers, @Nullable Integer maxPlayers,
    GameManifest.ProfileStatsDefinition profileStats) {

  public static ManifestView of(GameManifest manifest) {
    return new ManifestView(manifest.id(), manifest.name(), manifest.icon(), manifest.description(),
        manifest.experimental(), manifest.recommended(), manifest.minPlayers(), manifest.maxPlayers(),
        manifest.profileStats());
  }

  /** {@code supportsPlayerCount(manifest, playerCount)}. */
  public static boolean supportsPlayerCount(GameManifest manifest, int playerCount) {
    return playerCount >= manifest.minPlayers() && (manifest.maxPlayers() == null || playerCount <= manifest.maxPlayers());
  }
}
