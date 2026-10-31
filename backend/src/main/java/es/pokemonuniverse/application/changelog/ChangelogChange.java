package es.pokemonuniverse.application.changelog;

import io.micronaut.serde.annotation.Serdeable;

/** Un cambio de una entrada del changelog (changelogChangeSchema en shared). */
@Serdeable
public record ChangelogChange(String type, String text) {}
