package es.pokemonuniverse.application.datasync.pokemon;

import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.text.Collations;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code extractSpanishPokedexEntries} de {@code pokedex-entry-source.ts}: solo textos en español de versiones con
 * generación conocida, normalizando los espacios técnicos sin reescribir el texto oficial. El último texto de cada
 * versión gana; el orden es generación y después versión con {@code localeCompare}.
 */
public final class PokedexEntryExtractor {

  public record Entry(String pokemonId, String text, String language, int generation, String version,
      String versionLabel) {}

  private static final Map<String, Integer> VERSION_GENERATIONS = Map.ofEntries(
      Map.entry("red", 1), Map.entry("blue", 1), Map.entry("yellow", 1),
      Map.entry("gold", 2), Map.entry("silver", 2), Map.entry("crystal", 2),
      Map.entry("ruby", 3), Map.entry("sapphire", 3), Map.entry("emerald", 3), Map.entry("firered", 3),
      Map.entry("leafgreen", 3),
      Map.entry("diamond", 4), Map.entry("pearl", 4), Map.entry("platinum", 4), Map.entry("heartgold", 4),
      Map.entry("soulsilver", 4),
      Map.entry("black", 5), Map.entry("white", 5), Map.entry("black-2", 5), Map.entry("white-2", 5),
      Map.entry("x", 6), Map.entry("y", 6), Map.entry("omega-ruby", 6), Map.entry("alpha-sapphire", 6),
      Map.entry("sun", 7), Map.entry("moon", 7), Map.entry("ultra-sun", 7), Map.entry("ultra-moon", 7),
      Map.entry("lets-go-pikachu", 7), Map.entry("lets-go-eevee", 7),
      Map.entry("sword", 8), Map.entry("shield", 8), Map.entry("brilliant-diamond", 8), Map.entry("shining-pearl", 8),
      Map.entry("legends-arceus", 8),
      Map.entry("scarlet", 9), Map.entry("violet", 9));

  private static final Map<String, String> VERSION_LABELS = Map.ofEntries(
      Map.entry("red", "Pokémon Rojo"), Map.entry("blue", "Pokémon Azul"), Map.entry("yellow", "Pokémon Amarillo"),
      Map.entry("gold", "Pokémon Oro"), Map.entry("silver", "Pokémon Plata"), Map.entry("crystal", "Pokémon Cristal"),
      Map.entry("ruby", "Pokémon Rubí"), Map.entry("sapphire", "Pokémon Zafiro"),
      Map.entry("emerald", "Pokémon Esmeralda"), Map.entry("firered", "Pokémon Rojo Fuego"),
      Map.entry("leafgreen", "Pokémon Verde Hoja"),
      Map.entry("diamond", "Pokémon Diamante"), Map.entry("pearl", "Pokémon Perla"),
      Map.entry("platinum", "Pokémon Platino"), Map.entry("heartgold", "Pokémon HeartGold"),
      Map.entry("soulsilver", "Pokémon SoulSilver"),
      Map.entry("black", "Pokémon Negro"), Map.entry("white", "Pokémon Blanco"),
      Map.entry("black-2", "Pokémon Negro 2"), Map.entry("white-2", "Pokémon Blanco 2"),
      Map.entry("x", "Pokémon X"), Map.entry("y", "Pokémon Y"), Map.entry("omega-ruby", "Pokémon Rubí Omega"),
      Map.entry("alpha-sapphire", "Pokémon Zafiro Alfa"),
      Map.entry("sun", "Pokémon Sol"), Map.entry("moon", "Pokémon Luna"), Map.entry("ultra-sun", "Pokémon Ultrasol"),
      Map.entry("ultra-moon", "Pokémon Ultraluna"),
      Map.entry("lets-go-pikachu", "Pokémon Let's Go, Pikachu!"),
      Map.entry("lets-go-eevee", "Pokémon Let's Go, Eevee!"),
      Map.entry("sword", "Pokémon Espada"), Map.entry("shield", "Pokémon Escudo"),
      Map.entry("brilliant-diamond", "Pokémon Diamante Brillante"),
      Map.entry("shining-pearl", "Pokémon Perla Reluciente"),
      Map.entry("legends-arceus", "Leyendas Pokémon: Arceus"),
      Map.entry("scarlet", "Pokémon Escarlata"), Map.entry("violet", "Pokémon Púrpura"));

  private PokedexEntryExtractor() {}

  /**
   * {@code normalizePokedexEntryText}: rachas de {@code [\n\f\r\t]} → un espacio, rachas de 2+ espacios de JavaScript
   * ({@code \s{2,}}) → un espacio, y {@code trim} de JavaScript.
   */
  public static String normalize(String text) {
    var controls = text.replaceAll("[\\n\\f\\r\\t]+", " ");
    var out = new StringBuilder(controls.length());
    int i = 0;
    while (i < controls.length()) {
      int end = i;
      while (end < controls.length() && JsStrings.isJsWhitespace(controls.charAt(end))) end++;
      if (end - i >= 2) {
        out.append(' ');
        i = end;
      } else {
        out.append(controls.charAt(i));
        i++;
      }
    }
    return JsStrings.trim(out.toString());
  }

  public static List<Entry> spanishEntries(String pokemonId, List<PokeApiPayloads.FlavorText> source) {
    Map<String, Entry> unique = new LinkedHashMap<>();
    for (var item : source) {
      if (!"es".equals(item.language())) continue;
      var generation = VERSION_GENERATIONS.get(item.version());
      var text = normalize(item.text());
      if (generation == null || text.isEmpty()) continue;
      unique.put(item.version(), new Entry(pokemonId, text, "es", generation, item.version(),
          VERSION_LABELS.getOrDefault(item.version(), item.version())));
    }
    var entries = new ArrayList<>(unique.values());
    entries.sort(Comparator.comparingInt(Entry::generation).thenComparing(Entry::version, Collations.names()));
    return entries;
  }
}
