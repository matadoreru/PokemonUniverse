package es.pokemonuniverse.application.wouldyourather;

import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.serde.annotation.Serdeable;

/** Vista pública de un dilema ({@code CustomWouldYouRatherPromptView} de {@code packages/shared}); fechas ISO con milisegundos. */
@Serdeable
public record WouldYouRatherPromptView(String id, String optionA, String optionB, boolean enabled, String createdAt,
    String updatedAt) {

  static WouldYouRatherPromptView of(StoredWouldYouRatherPrompt prompt) {
    return new WouldYouRatherPromptView(prompt.id(), prompt.optionA(), prompt.optionB(), prompt.enabled(),
        IsoTimestamps.millis(prompt.createdAt()), IsoTimestamps.millis(prompt.updatedAt()));
  }
}
