package es.pokemonuniverse.domain.identity;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import io.micronaut.serde.annotation.Serdeable;
import java.util.regex.Pattern;

/**
 * Avatar de un jugador: la inicial ({@code DEFAULT}) o una imagen subida ({@code CUSTOM}). Los avatares predefinidos
 * ({@code PRESET}) ya no existen.
 */
@Serdeable
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
  @JsonSubTypes.Type(value = AvatarRef.Default.class, name = "DEFAULT"),
  @JsonSubTypes.Type(value = AvatarRef.Custom.class, name = "CUSTOM")
})
public sealed interface AvatarRef {

  Pattern CUSTOM_FILE = Pattern.compile("^[0-9a-f-]{36}\\.webp$");

  @Serdeable
  record Default() implements AvatarRef {}

  @Serdeable
  record Custom(String value, long version) implements AvatarRef {}

  static boolean isValidCustomFile(String value) {
    return value != null && CUSTOM_FILE.matcher(value).matches();
  }
}
