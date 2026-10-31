package es.pokemonuniverse.domain.identity;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import io.micronaut.serde.annotation.Serdeable;
import java.util.Set;
import java.util.regex.Pattern;

/** Avatar de un jugador; el JSON tiene exactamente las formas que acepta el servidor Node. */
@Serdeable
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
  @JsonSubTypes.Type(value = AvatarRef.Default.class, name = "DEFAULT"),
  @JsonSubTypes.Type(value = AvatarRef.Preset.class, name = "PRESET"),
  @JsonSubTypes.Type(value = AvatarRef.Custom.class, name = "CUSTOM")
})
public sealed interface AvatarRef {

  Set<String> PRESETS = Set.of("trainer-berry", "trainer-aqua", "trainer-electric", "trainer-violet");
  Pattern CUSTOM_FILE = Pattern.compile("^[0-9a-f-]{36}\\.webp$");

  @Serdeable
  record Default() implements AvatarRef {}

  @Serdeable
  record Preset(String value) implements AvatarRef {}

  @Serdeable
  record Custom(String value, long version) implements AvatarRef {}

  static boolean isValidPreset(String value) {
    return value != null && PRESETS.contains(value);
  }

  static boolean isValidCustomFile(String value) {
    return value != null && CUSTOM_FILE.matcher(value).matches();
  }
}
