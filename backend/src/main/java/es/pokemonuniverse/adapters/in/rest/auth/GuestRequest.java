package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.application.auth.GuestCommand;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Serdeable
public record GuestRequest(
    @NotBlank(message = "El nombre es obligatorio")
        @Size(min = 2, max = 24, message = "El nombre debe tener entre 2 y 24 caracteres")
        @Pattern(regexp = "^[\\p{L}\\p{N}_ -]+$", message = "El nombre contiene caracteres no permitidos")
        @Nullable String displayName,
    @Pattern(regexp = "^(trainer-berry|trainer-aqua|trainer-electric|trainer-violet)$", message = "El avatar no es válido")
        @Nullable String avatarPresetId) {

  public GuestRequest normalized() {
    return new GuestRequest(displayName == null ? null : displayName.trim(), avatarPresetId);
  }

  public GuestCommand toCommand() {
    return new GuestCommand(displayName, avatarPresetId);
  }
}
