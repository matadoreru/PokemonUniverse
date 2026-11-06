package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.ConnectionAnswerGroup;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.ConnectionPokemon;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.DoubleSupplier;
import java.util.function.Predicate;

/**
 * Nació como traducción de {@code pokemon-connections/catalog.ts}: las categorías curadas
 * ({@code connectionCategoryCatalog}) y las plantillas ({@code connectionCuratedTemplates}) siguen en el orden del TS.
 * Las categorías dinámicas y la generación del puzle ya divergen a propósito: sin colores, con más categorías sacadas de
 * los datos del catálogo, sin preferir las plantillas y con familias para variar cada tablero. El orden importa:
 * alimenta {@code shuffled} y las rotaciones.
 */
public final class PokemonConnectionsCatalog {

  /** {@code POKEMON_TYPES} de {@code pokemon/types.ts}, en su orden, con su etiqueta de {@code typeLabels}. */
  private static final Map<String, String> TYPE_LABELS = orderedLabels(
      "normal", "Normal", "fire", "Fuego", "water", "Agua", "electric", "Eléctrico", "grass", "Planta",
      "ice", "Hielo", "fighting", "Lucha", "poison", "Veneno", "ground", "Tierra", "flying", "Volador",
      "psychic", "Psíquico", "bug", "Bicho", "rock", "Roca", "ghost", "Fantasma", "dragon", "Dragón",
      "dark", "Siniestro", "steel", "Acero", "fairy", "Hada");

  /** Combinaciones de dos tipos frecuentes (en cualquier orden), con su id: {@code dual-<tipo>-<tipo>}. */
  private static final List<List<String>> DUAL_TYPES = List.of(
      List.of("normal", "flying"), List.of("grass", "poison"), List.of("bug", "flying"), List.of("bug", "poison"),
      List.of("water", "rock"), List.of("ground", "rock"), List.of("water", "ground"), List.of("water", "ice"));

  /**
   * Habilidades conocidas, por su id y su nombre en español (el catálogo guarda {@code abilities} con ese nombre,
   * ocultas incluidas).
   */
  private static final Map<String, String> ABILITY_LABELS = orderedLabels(
      "espesura", "Espesura", "mar-llamas", "Mar Llamas", "torrente", "Torrente", "enjambre", "Enjambre",
      "levitacion", "Levitación", "intimidacion", "Intimidación", "robustez", "Robustez", "sincronia", "Sincronía",
      "nado-rapido", "Nado Rápido", "clorofila", "Clorofila", "absorbe-agua", "Absorbe Agua",
      "electricidad-estatica", "Electricidad Estática", "pararrayos", "Pararrayos", "presion", "Presión");

  /** Iniciales del nombre mostrado con bastantes Pokémon en todas las generaciones. */
  private static final List<String> NAME_INITIALS = List.of("A", "B", "C", "D", "G", "M", "P", "T");

  /**
   * Familias de categorías que expresan la misma idea: un tablero no repite familia si puede evitarlo. Lo que no está
   * aquí ni encaja en un prefijo de {@link #categoryFamily} es su propia familia.
   */
  private static final Map<String, String> FAMILY_BY_ID = Map.ofEntries(
      Map.entry("single-type", "types"), Map.entry("dual-type", "types"),
      Map.entry("grass-partners", "starters"), Map.entry("fire-partners", "starters"),
      Map.entry("water-partners", "starters"), Map.entry("final-starters", "starters"),
      Map.entry("ability-espesura", "starters"), Map.entry("ability-mar-llamas", "starters"),
      Map.entry("ability-torrente", "starters"),
      Map.entry("evolution-first", "evolution-stage"), Map.entry("evolution-final", "evolution-stage"),
      Map.entry("single-stage", "evolution-stage"),
      Map.entry("legendary", "rarity"), Map.entry("mythical", "rarity"), Map.entry("ordinary", "rarity"),
      Map.entry("heavyweights", "size"), Map.entry("featherweights", "size"), Map.entry("giants", "size"),
      Map.entry("tiny", "size"),
      Map.entry("bst-600-plus", "stats"), Map.entry("speed-100-plus", "stats"), Map.entry("same-defenses", "stats"));

  private PokemonConnectionsCatalog() {}

  /**
   * {@code CategoryDefinition}: una lista fija de ids ({@code pokemonIds}) o un predicado ({@code matches}). Tres
   * textos contiguos: se construye con {@link #category(String)}.
   */
  public record CategoryDefinition(String id, String label, String explanation, @Nullable List<String> pokemonIds,
      @Nullable Predicate<Pokemon> matches) {

    public CategoryDefinition {
      pokemonIds = pokemonIds == null ? null : frozenList(pokemonIds);
    }

    /** {@code ids?.has(pokemon.id) || definition.matches?.(pokemon)}. */
    boolean includes(Pokemon pokemon) {
      return (pokemonIds != null && pokemonIds.contains(pokemon.id())) || (matches != null && matches.test(pokemon));
    }
  }

  /** Setters con nombre para {@link CategoryDefinition}; {@code pokemonIds} o {@code matches} la terminan. */
  static final class CategoryBuilder {
    private final String id;
    private String label;
    private String explanation;

    private CategoryBuilder(String id) {
      this.id = Objects.requireNonNull(id, "id");
    }

    CategoryBuilder label(String value) { label = value; return this; }

    CategoryBuilder explanation(String value) { explanation = value; return this; }

    CategoryDefinition pokemonIds(String... ids) {
      return new CategoryDefinition(id, Objects.requireNonNull(label, "label"),
          Objects.requireNonNull(explanation, "explanation"), Arrays.asList(ids), null);
    }

    CategoryDefinition matches(Predicate<Pokemon> predicate) {
      return new CategoryDefinition(id, Objects.requireNonNull(label, "label"),
          Objects.requireNonNull(explanation, "explanation"), null, Objects.requireNonNull(predicate, "matches"));
    }
  }

  static CategoryBuilder category(String id) {
    return new CategoryBuilder(id);
  }

  /** {@code { categoryId, pokemonIds }} de una plantilla curada. */
  public record TemplateGroup(String categoryId, List<String> pokemonIds) {

    public TemplateGroup {
      pokemonIds = frozenList(pokemonIds);
    }
  }

  /** {@code CuratedTemplate}. */
  public record CuratedTemplate(String id, List<TemplateGroup> groups) {

    public CuratedTemplate {
      groups = frozenList(groups);
    }
  }

  private static TemplateGroup group(String categoryId, String... pokemonIds) {
    return new TemplateGroup(categoryId, Arrays.asList(pokemonIds));
  }

  private static CuratedTemplate template(String id, TemplateGroup... groups) {
    return new CuratedTemplate(id, Arrays.asList(groups));
  }

  /** {@code GeneratedConnectionsPuzzle}; {@code source} es {@code CURATED} o {@code DYNAMIC}. */
  public record GeneratedConnectionsPuzzle(String key, String source, List<ConnectionAnswerGroup> groups) {

    public GeneratedConnectionsPuzzle {
      groups = frozenList(groups);
    }
  }

  /** {@code connectionCategoryCatalog}. */
  public static final List<CategoryDefinition> CONNECTION_CATEGORY_CATALOG = List.of(
      category("eevee-family")
          .label("Evoluciones de Eevee")
          .explanation("Todas son evoluciones posibles de Eevee.")
          .pokemonIds("vaporeon", "jolteon", "flareon", "espeon", "umbreon", "leafeon", "glaceon", "sylveon"),
      category("fossils")
          .label("Pokémon fósiles")
          .explanation("Proceden de fósiles que pueden revivirse.")
          .pokemonIds("omanyte", "kabuto", "aerodactyl", "lileep", "anorith", "cranidos", "shieldon", "tirtouga",
              "archen", "tyrunt", "amaura", "dracozolt", "arctozolt", "dracovish", "arctovish"),
      category("dogs")
          .label("Pokémon con aspecto canino")
          .explanation("Su diseño está inspirado en perros o cánidos.")
          .pokemonIds("growlithe", "arcanine", "houndour", "houndoom", "electrike", "manectric", "lillipup", "herdier",
              "stoutland", "rockruff", "lycanroc-midday", "yamper", "boltund", "fidough", "dachsbun", "greavard",
              "houndstone", "mabosstiff"),
      category("food")
          .label("Relacionados con comida")
          .explanation("Su diseño o concepto está relacionado con alimentos o bebidas.")
          .pokemonIds("vanillite", "vanillish", "vanilluxe", "swirlix", "slurpuff", "applin", "flapple", "appletun",
              "sinistea", "polteageist", "milcery", "alcremie", "smoliv", "dolliv", "arboliva", "fidough", "dachsbun",
              "tatsugiri-curly"),
      category("cats")
          .label("Pokémon con aspecto felino")
          .explanation("Su diseño está inspirado en gatos o felinos.")
          .pokemonIds("meowth", "persian", "skitty", "delcatty", "glameow", "purugly", "purrloin", "liepard", "litleo",
              "pyroar-male", "espurr", "meowstic-male", "litten", "torracat", "incineroar", "sprigatito", "floragato",
              "meowscarada"),
      category("bears")
          .label("Pokémon con aspecto de oso")
          .explanation("Su diseño está inspirado en osos.")
          .pokemonIds("teddiursa", "ursaring", "cubchoo", "beartic", "stufful", "bewear", "kubfu",
              "urshifu-single-strike"),
      category("baby")
          .label("Pokémon bebé")
          .explanation("Pertenecen al grupo oficial de Pokémon bebé.")
          .pokemonIds("pichu", "cleffa", "igglybuff", "togepi", "tyrogue", "smoochum", "elekid", "magby", "azurill",
              "wynaut", "budew", "chingling", "bonsly", "mime-jr", "happiny", "munchlax", "riolu", "mantyke", "toxel"),
      category("pseudo-final")
          .label("Pseudolegendarios finales")
          .explanation("Son la fase final de una familia considerada pseudolegendaria.")
          .pokemonIds("dragonite", "tyranitar", "salamence", "metagross", "garchomp", "hydreigon", "goodra", "kommo-o",
              "dragapult", "baxcalibur"),
      category("electric-rodents")
          .label("Roedores eléctricos")
          .explanation("Forman el grupo informal de roedores eléctricos de cada generación.")
          .pokemonIds("pikachu", "raichu", "pichu", "plusle", "minun", "pachirisu", "emolga", "dedenne", "togedemaru",
              "morpeko-full-belly", "pawmi", "pawmo", "pawmot"),
      category("artificial-objects")
          .label("Objetos animados")
          .explanation("Su diseño convierte un objeto cotidiano en Pokémon.")
          .pokemonIds("magnemite", "magneton", "voltorb", "electrode", "klink", "klang", "klinklang", "litwick",
              "lampent", "chandelure", "trubbish", "garbodor", "vanillite", "vanillish", "vanilluxe", "honedge",
              "doublade", "aegislash-shield", "klefki", "sinistea", "polteageist"),
      category("grass-partners")
          .label("Compañeros iniciales de tipo Planta")
          .explanation("Se pueden elegir como primer compañero de una región y empiezan con tipo Planta.")
          .pokemonIds("bulbasaur", "chikorita", "treecko", "turtwig", "snivy", "chespin", "rowlet", "grookey",
              "sprigatito"),
      category("fire-partners")
          .label("Compañeros iniciales de tipo Fuego")
          .explanation("Se pueden elegir como primer compañero de una región y empiezan con tipo Fuego.")
          .pokemonIds("charmander", "cyndaquil", "torchic", "chimchar", "tepig", "fennekin", "litten", "scorbunny",
              "fuecoco"),
      category("water-partners")
          .label("Compañeros iniciales de tipo Agua")
          .explanation("Se pueden elegir como primer compañero de una región y empiezan con tipo Agua.")
          .pokemonIds("squirtle", "totodile", "mudkip", "piplup", "oshawott", "froakie", "popplio", "sobble", "quaxly"),
      category("regional-birds")
          .label("Aves de las primeras rutas")
          .explanation("Pertenecen a familias de aves que aparecen al principio de sus regiones.")
          .pokemonIds("pidgeot", "noctowl", "swellow", "staraptor", "unfezant", "talonflame", "toucannon",
              "corviknight", "kilowattrel"),
      category("trade-evolution")
          .label("Evolucionan al intercambiarlos")
          .explanation("Su método de evolución exige un intercambio, a veces con un objeto equipado o por otro Pokémon "
              + "concreto.")
          .pokemonIds("kadabra", "machoke", "graveler", "haunter", "poliwhirl", "slowpoke", "onix", "scyther", "seadra",
              "porygon", "rhydon", "electabuzz", "magmar", "porygon2", "feebas", "dusclops", "clamperl", "boldore",
              "gurdurr", "karrablast", "shelmet", "spritzee", "swirlix", "phantump", "pumpkaboo-average"),
      category("branch-evolution")
          .label("Tienen una evolución ramificada")
          .explanation("Pueden evolucionar en especies diferentes según las condiciones.")
          .pokemonIds("eevee", "gloom", "poliwhirl", "slowpoke", "scyther", "tyrogue", "wurmple", "nincada", "kirlia",
              "snorunt", "clamperl", "burmy", "cosmoem", "applin", "charcadet"),
      category("friendship-evolution")
          .label("Evolucionan con amistad")
          .explanation("Una amistad alta forma parte de su método de evolución.")
          .pokemonIds("golbat", "chansey", "pichu", "cleffa", "igglybuff", "togepi", "eevee", "azurill", "budew",
              "chingling", "buneary", "riolu", "munchlax", "woobat", "swadloon", "type-null", "snom"),
      category("stone-evolution")
          .label("Evolucionan con una piedra")
          .explanation("Necesitan una piedra evolutiva para alcanzar su siguiente fase.")
          .pokemonIds("pikachu", "nidorina", "nidorino", "clefairy", "vulpix", "jigglypuff", "gloom", "growlithe",
              "poliwhirl", "weepinbell", "shellder", "exeggcute", "staryu", "eevee", "togetic", "murkrow", "misdreavus",
              "sunkern", "lombre", "nuzleaf", "skitty", "kirlia", "roselia", "snorunt", "pansage", "pansear", "panpour",
              "munna", "cottonee", "petilil", "minccino", "eelektrik", "lampent", "floette", "doublade", "helioptile",
              "charjabug", "crabrawler", "capsakid", "tadbulb", "cetoddle"),
      category("turtles")
          .label("Pokémon con aspecto de tortuga")
          .explanation("Su diseño está inspirado en tortugas terrestres o marinas.")
          .pokemonIds("squirtle", "wartortle", "blastoise", "torkoal", "turtwig", "grotle", "torterra", "tirtouga",
              "carracosta", "turtonator", "chewtle", "drednaw"),
      category("snakes")
          .label("Pokémon con aspecto de serpiente")
          .explanation("Tienen un cuerpo y diseño inspirados en serpientes.")
          .pokemonIds("ekans", "arbok", "onix", "steelix", "dunsparce", "seviper", "snivy", "servine", "serperior",
              "silicobra", "sandaconda"),
      category("monkeys")
          .label("Pokémon con aspecto de simio")
          .explanation("Su diseño está inspirado en monos u otros simios.")
          .pokemonIds("mankey", "primeape", "aipom", "ambipom", "chimchar", "monferno", "infernape", "pansage",
              "pansear", "panpour", "simisage", "simisear", "simipour", "oranguru", "passimian", "grookey", "thwackey",
              "rillaboom"),
      category("horses")
          .label("Pokémon con aspecto equino")
          .explanation("Su diseño está inspirado en caballos, cebras o asnos.")
          .pokemonIds("ponyta", "rapidash", "blitzle", "zebstrika", "mudbray", "mudsdale", "glastrier", "spectrier"),
      category("crustaceans")
          .label("Pokémon crustáceos")
          .explanation("Su diseño toma rasgos de cangrejos u otros crustáceos.")
          .pokemonIds("krabby", "kingler", "corphish", "crawdaunt", "dwebble", "crustle", "clauncher", "clawitzer",
              "crabrawler", "crabominable", "klawf"),
      category("frogs")
          .label("Pokémon con aspecto de rana")
          .explanation("Su diseño está inspirado en ranas, sapos o renacuajos.")
          .pokemonIds("poliwag", "poliwhirl", "poliwrath", "politoed", "croagunk", "toxicroak", "tympole", "palpitoad",
              "seismitoad", "froakie", "frogadier", "greninja", "tadbulb", "bellibolt"),
      category("rabbits")
          .label("Pokémon con aspecto de conejo")
          .explanation("Su diseño está inspirado en conejos o liebres.")
          .pokemonIds("nidoran-f", "nidoran-m", "azumarill", "buneary", "lopunny", "bunnelby", "diggersby", "scorbunny",
              "raboot", "cinderace"),
      category("foxes")
          .label("Pokémon con aspecto de zorro")
          .explanation("Su diseño está inspirado en zorros.")
          .pokemonIds("vulpix", "ninetales", "eevee", "flareon", "espeon", "umbreon", "fennekin", "braixen", "delphox",
              "nickit", "thievul"),
      category("bats")
          .label("Pokémon con aspecto de murciélago")
          .explanation("Su diseño está inspirado en murciélagos.")
          .pokemonIds("zubat", "golbat", "crobat", "woobat", "swoobat", "noibat", "noivern"),
      category("penguins")
          .label("Pokémon con aspecto de pingüino")
          .explanation("Su diseño está inspirado en pingüinos.")
          .pokemonIds("piplup", "prinplup", "empoleon", "eiscue-ice"),
      category("owls")
          .label("Pokémon con aspecto de búho")
          .explanation("Su diseño está inspirado en búhos o lechuzas.")
          .pokemonIds("hoothoot", "noctowl", "rowlet", "dartrix", "decidueye"),
      category("pigs")
          .label("Pokémon con aspecto porcino")
          .explanation("Su diseño está inspirado en cerdos o jabalíes.")
          .pokemonIds("swinub", "piloswine", "spoink", "grumpig", "mamoswine", "tepig", "pignite", "emboar", "lechonk",
              "oinkologne-male"),
      category("elephants")
          .label("Pokémon con aspecto de elefante")
          .explanation("Su diseño está inspirado en elefantes.")
          .pokemonIds("phanpy", "donphan", "cufant", "copperajah"),
      category("sharks")
          .label("Pokémon con aspecto de tiburón")
          .explanation("Su diseño está inspirado en tiburones.")
          .pokemonIds("carvanha", "sharpedo", "gible", "gabite", "garchomp"),
      category("mushrooms")
          .label("Pokémon con aspecto de hongo")
          .explanation("Su diseño está inspirado en setas u hongos.")
          .pokemonIds("paras", "parasect", "shroomish", "breloom", "foongus", "amoonguss", "morelull", "shiinotic",
              "toedscool", "toedscruel"),
      category("flowers")
          .label("Pokémon con flores")
          .explanation("Las flores son una parte central de su diseño.")
          .pokemonIds("vileplume", "bellossom", "sunflora", "roselia", "roserade", "cherrim", "lilligant", "flabebe",
              "floette", "florges", "comfey"),
      category("musical")
          .label("Relacionados con la música")
          .explanation("Su diseño o comportamiento está ligado a instrumentos, canto o ritmo.")
          .pokemonIds("jigglypuff", "ludicolo", "chimecho", "kricketune", "chatot", "meloetta-aria", "rillaboom",
              "toxtricity-amped", "skeledirge"),
      category("pokeball-lookalikes")
          .label("Se parecen a Poké Balls")
          .explanation("Su forma o patrón visual recuerda deliberadamente a una Poké Ball.")
          .pokemonIds("voltorb", "electrode", "foongus", "amoonguss", "gimmighoul"),
      category("multiple-heads")
          .label("Tienen varias cabezas")
          .explanation("Su diseño muestra dos o más cabezas claramente diferenciadas.")
          .pokemonIds("dugtrio", "magneton", "doduo", "dodrio", "exeggcute", "exeggutor", "weezing", "combee",
              "zweilous", "hydreigon"),
      category("ancient-future-paradox")
          .label("Pokémon Paradoja")
          .explanation("Son especies Paradoja procedentes del pasado o del futuro.")
          .pokemonIds("great-tusk", "scream-tail", "brute-bonnet", "flutter-mane", "slither-wing", "sandy-shocks",
              "iron-treads", "iron-bundle", "iron-hands", "iron-jugulis", "iron-moth", "iron-thorns", "roaring-moon",
              "iron-valiant", "walking-wake", "iron-leaves", "gouging-fire", "raging-bolt", "iron-boulder",
              "iron-crown"),
      category("ultra-beasts")
          .label("Ultraentes")
          .explanation("Pertenecen al grupo oficial de los Ultraentes.")
          .pokemonIds("nihilego", "buzzwole", "pheromosa", "xurkitree", "celesteela", "kartana", "guzzlord", "poipole",
              "naganadel", "stakataka", "blacephalon"),
      category("regi-family")
          .label("Familia de los Regis")
          .explanation("Forman parte del grupo de gigantes legendarios conocidos como Regis.")
          .pokemonIds("regirock", "regice", "registeel", "regigigas", "regieleki", "regidrago"),
      category("rodents")
          .label("Pokémon con aspecto de roedor")
          .explanation("Su diseño está inspirado en ratones, ratas, ardillas u otros roedores.")
          .pokemonIds("rattata", "raticate", "pikachu", "raichu", "sandshrew", "sandslash", "sentret", "furret",
              "marill", "plusle", "minun", "bidoof", "bibarel", "pachirisu", "emolga", "dedenne", "togedemaru",
              "skwovet", "greedent", "morpeko-full-belly", "pawmi", "pawmo", "pawmot", "tandemaus",
              "maushold-family-of-four"),
      category("spiders")
          .label("Pokémon con aspecto de araña")
          .explanation("Su diseño está inspirado en arañas u otros arácnidos similares.")
          .pokemonIds("spinarak", "ariados", "joltik", "galvantula", "dewpider", "araquanid", "tarountula", "spidops"),
      category("butterflies-moths")
          .label("Mariposas y polillas")
          .explanation("Su diseño adulto está inspirado en mariposas o polillas.")
          .pokemonIds("butterfree", "venomoth", "beautifly", "dustox", "mothim", "volcarona", "vivillon", "frosmoth"),
      category("fish")
          .label("Pokémon con aspecto de pez")
          .explanation("Su diseño está inspirado principalmente en peces.")
          .pokemonIds("magikarp", "goldeen", "seaking", "chinchou", "lanturn", "qwilfish", "remoraid", "carvanha",
              "sharpedo", "barboach", "whiscash", "feebas", "relicanth", "luvdisc", "finneon", "lumineon",
              "basculin-red-striped", "alomomola", "tynamo", "eelektrik", "eelektross", "stunfisk", "wishiwashi-solo",
              "bruxish", "arrokuda", "barraskewda", "basculegion-male", "overqwil", "veluza", "dondozo"),
      category("sheep-goats")
          .label("Ovejas y cabras")
          .explanation("Su diseño está inspirado en ovejas, carneros o cabras.")
          .pokemonIds("mareep", "flaaffy", "ampharos", "skiddo", "gogoat", "wooloo", "dubwool"),
      category("ducks")
          .label("Pokémon con aspecto de pato")
          .explanation("Su diseño está inspirado en patos u otras aves acuáticas afines.")
          .pokemonIds("psyduck", "golduck", "farfetchd", "ducklett", "swanna", "quaxly", "quaxwell", "quaquaval"),
      category("legendary-birds")
          .label("Aves legendarias de Kanto")
          .explanation("Forman el trío de aves legendarias descubierto en Kanto.")
          .pokemonIds("articuno", "zapdos", "moltres"),
      category("legendary-beasts")
          .label("Bestias legendarias de Johto")
          .explanation("Forman el trío de bestias legendarias de Johto.")
          .pokemonIds("raikou", "entei", "suicune"),
      category("weather-trio")
          .label("Trío meteorológico de Hoenn")
          .explanation("Kyogre, Groudon y Rayquaza forman el trío legendario asociado al clima de Hoenn.")
          .pokemonIds("kyogre", "groudon", "rayquaza"),
      category("lake-guardians")
          .label("Guardianes del lago")
          .explanation("Uxie, Mesprit y Azelf forman el trío de los lagos de Sinnoh.")
          .pokemonIds("uxie", "mesprit", "azelf"),
      category("creation-trio")
          .label("Trío de la creación")
          .explanation("Dialga, Palkia y Giratina forman el trío de la creación de Sinnoh.")
          .pokemonIds("dialga", "palkia", "giratina-altered"),
      category("swords-of-justice")
          .label("Espadachines Místicos")
          .explanation("Pertenecen al grupo legendario de los Espadachines Místicos.")
          .pokemonIds("cobalion", "terrakion", "virizion", "keldeo-ordinary"),
      category("forces-of-nature")
          .label("Fuerzas de la Naturaleza")
          .explanation("Pertenecen al grupo legendario de las Fuerzas de la Naturaleza.")
          .pokemonIds("tornadus-incarnate", "thundurus-incarnate", "landorus-incarnate", "enamorus-incarnate"),
      category("tapu-guardians")
          .label("Guardianes de las islas de Alola")
          .explanation("Son las cuatro deidades guardianas de las islas de Alola.")
          .pokemonIds("tapu-koko", "tapu-lele", "tapu-bulu", "tapu-fini"),
      category("treasures-of-ruin")
          .label("Tesoros de la Ruina")
          .explanation("Pertenecen al cuarteto legendario de los Tesoros de la Ruina.")
          .pokemonIds("wo-chien", "chien-pao", "ting-lu", "chi-yu"),
      category("loyal-three-and-master")
          .label("Séquito de Pecharunt")
          .explanation("Okidogi, Munkidori y Fezandipiti recibieron sus cadenas de Pecharunt.")
          .pokemonIds("okidogi", "munkidori", "fezandipiti", "pecharunt"),
      category("mythical-balanced-stats")
          .label("Singulares con 100 en cada estadística")
          .explanation("Sus seis estadísticas base tienen exactamente 100 puntos.")
          .pokemonIds("mew", "celebi", "jirachi", "manaphy", "shaymin-land"),
      category("movie-stars")
          .label("Protagonistas de películas")
          .explanation("Cada uno es el Pokémon invitado central de alguna película de Pokémon.")
          .pokemonIds("mewtwo", "mew", "lugia", "entei", "celebi", "ho-oh", "latias", "latios", "jirachi",
              "deoxys-normal", "rayquaza", "lucario", "manaphy", "darkrai", "dialga", "palkia", "giratina-altered",
              "shaymin-land", "arceus", "zoroark", "victini", "reshiram", "zekrom", "kyurem", "keldeo-ordinary",
              "genesect", "xerneas", "yveltal", "diancie", "hoopa", "volcanion", "magearna", "marshadow", "zeraora",
              "zarude"),
      category("ash-team")
          .label("Pokémon de Ash")
          .explanation("Formaron parte del equipo de Ash en el anime, en la fase en que los tuvo.")
          .pokemonIds("pikachu", "bulbasaur", "charizard", "squirtle", "butterfree", "pidgeot", "primeape", "kingler",
              "muk", "tauros", "snorlax", "lapras", "gengar", "dragonite", "heracross", "bayleef", "quilava",
              "totodile", "noctowl", "donphan", "sceptile", "corphish", "torkoal", "swellow", "glalie", "staraptor",
              "torterra", "infernape", "buizel", "gible", "gliscor", "lucario", "unfezant", "pignite", "oshawott",
              "snivy", "scraggy", "leavanny", "palpitoad", "krookodile", "boldore", "greninja", "talonflame",
              "hawlucha", "goodra", "noivern", "rowlet", "torracat", "melmetal", "sirfetchd", "dracovish"),
      category("misty-team")
          .label("Pokémon de Misty")
          .explanation("Formaron parte del equipo de Misty en el anime.")
          .pokemonIds("staryu", "starmie", "goldeen", "horsea", "psyduck", "togetic", "politoed", "gyarados", "corsola",
              "azurill", "luvdisc"),
      category("brock-team")
          .label("Pokémon de Brock")
          .explanation("Formaron parte del equipo de Brock en el anime.")
          .pokemonIds("geodude", "steelix", "vulpix", "crobat", "forretress", "ludicolo", "marshtomp", "sudowoodo",
              "croagunk"),
      category("team-rocket")
          .label("Pokémon de Jessie y James")
          .explanation("Los usaron Jessie, James o Meowth, del Team Rocket, en el anime.")
          .pokemonIds("meowth", "arbok", "weezing", "victreebel", "lickitung", "wobbuffet", "cacnea", "seviper",
              "dustox", "chimecho", "yanmega", "mime-jr", "carnivine", "woobat", "yamask", "amoonguss", "frillish-male",
              "inkay", "mimikyu-disguised", "mareanie"),
      category("champion-aces")
          .label("Ases de los Campeones")
          .explanation("Son el Pokémon estrella de un Campeón de la Liga en los juegos principales.")
          .pokemonIds("dragonite", "metagross", "milotic", "garchomp", "volcarona", "haxorus", "gardevoir", "charizard",
              "glimmora", "pawmot"),
      category("box-art")
          .label("Mascotas de portada")
          .explanation("Aparecen en la portada de algún juego principal de la saga.")
          .pokemonIds("venusaur", "charizard", "blastoise", "pikachu", "eevee", "ho-oh", "lugia", "suicune", "groudon",
              "kyogre", "rayquaza", "dialga", "palkia", "giratina-altered", "arceus", "reshiram", "zekrom", "kyurem",
              "xerneas", "yveltal", "solgaleo", "lunala", "necrozma", "zacian", "zamazenta", "koraidon", "miraidon"),
      category("final-starters")
          .label("Evoluciones finales de iniciales")
          .explanation("Son la última fase de un Pokémon inicial de los juegos principales.")
          .pokemonIds("venusaur", "charizard", "blastoise", "meganium", "typhlosion", "feraligatr", "sceptile",
              "blaziken", "swampert", "torterra", "infernape", "empoleon", "serperior", "emboar", "samurott",
              "chesnaught", "delphox", "greninja", "decidueye", "incineroar", "primarina", "rillaboom", "cinderace",
              "inteleon", "meowscarada", "skeledirge", "quaquaval"),
      category("regional-forms")
          .label("Tienen forma regional")
          .explanation("Tienen una variante regional de Alola, Galar, Hisui o Paldea.")
          .pokemonIds("rattata", "raticate", "raichu", "sandshrew", "sandslash", "vulpix", "ninetales", "diglett",
              "dugtrio", "meowth", "persian", "growlithe", "arcanine", "geodude", "graveler", "golem", "ponyta",
              "rapidash", "slowpoke", "slowbro", "farfetchd", "grimer", "muk", "voltorb", "electrode", "exeggutor",
              "marowak", "weezing", "mr-mime", "tauros", "articuno", "zapdos", "moltres", "typhlosion", "wooper",
              "slowking", "qwilfish", "sneasel", "corsola", "zigzagoon", "linoone", "samurott", "lilligant", "darumaka",
              "darmanitan-standard", "yamask", "zorua", "zoroark", "stunfisk", "braviary", "sliggoo", "goodra",
              "avalugg", "decidueye"),
      category("kalos-hoenn-megas")
          .label("Megaevolucionaron en X/Y o Rubí Omega/Zafiro Alfa")
          .explanation("Recibieron una megaevolución en Pokémon X e Y o en Rubí Omega y Zafiro Alfa.")
          .pokemonIds("venusaur", "charizard", "blastoise", "beedrill", "pidgeot", "alakazam", "slowbro", "gengar",
              "kangaskhan", "pinsir", "gyarados", "aerodactyl", "mewtwo", "ampharos", "steelix", "scizor", "heracross",
              "houndoom", "tyranitar", "sceptile", "blaziken", "swampert", "gardevoir", "sableye", "mawile", "aggron",
              "medicham", "manectric", "sharpedo", "camerupt", "altaria", "banette", "absol", "glalie", "salamence",
              "metagross", "latias", "latios", "rayquaza", "lopunny", "garchomp", "lucario", "abomasnow", "gallade",
              "audino", "diancie"),
      category("gigantamax")
          .label("Tienen forma Gigamax")
          .explanation("Pueden gigamaxizarse en Pokémon Espada y Escudo.")
          .pokemonIds("venusaur", "charizard", "blastoise", "butterfree", "pikachu", "meowth", "machamp", "gengar",
              "kingler", "lapras", "eevee", "snorlax", "garbodor", "melmetal", "rillaboom", "cinderace", "inteleon",
              "corviknight", "orbeetle", "drednaw", "coalossal", "flapple", "appletun", "sandaconda",
              "toxtricity-amped", "centiskorch", "hatterene", "grimmsnarl", "alcremie", "copperajah", "duraludon",
              "urshifu-single-strike"),
      category("fusions")
          .label("Pueden fusionarse")
          .explanation("Pueden fusionarse con otro Pokémon concreto mediante un objeto.")
          .pokemonIds("reshiram", "zekrom", "kyurem", "solgaleo", "lunala", "necrozma", "glastrier", "spectrier",
              "calyrex"),
      category("ability-forms")
          .label("Cambian de forma en combate por su habilidad")
          .explanation("Su habilidad les hace cambiar de forma durante el combate.")
          .pokemonIds("castform", "cherrim", "darmanitan-standard", "aegislash-shield", "zygarde-50", "wishiwashi-solo",
              "minior-red-meteor", "mimikyu-disguised", "cramorant", "eiscue-ice", "morpeko-full-belly", "palafin-zero",
              "terapagos"),
      category("move-evolution")
          .label("Evolucionan conociendo un movimiento")
          .explanation("Evolucionan al subir de nivel si conocen un movimiento concreto.")
          .pokemonIds("lickitung", "tangela", "aipom", "yanma", "piloswine", "mime-jr", "bonsly", "steenee", "poipole",
              "clobbopus", "girafarig", "dunsparce"),
      category("cocoons")
          .label("Fases de capullo o crisálida")
          .explanation("Son la fase intermedia de capullo, crisálida o pupa de su familia.")
          .pokemonIds("metapod", "kakuna", "pupitar", "silcoon", "cascoon", "swadloon", "spewpa", "cosmoem", "dottler"),
      category("human-made")
          .label("Creados por el ser humano")
          .explanation("Según su historia oficial, los creó o modificó el ser humano.")
          .pokemonIds("porygon", "porygon2", "porygon-z", "mewtwo", "golett", "golurk", "genesect", "type-null",
              "silvally", "magearna"),
      category("space")
          .label("Relacionados con el espacio")
          .explanation("Su diseño o su historia está ligado a estrellas, la Luna, el Sol o el espacio exterior.")
          .pokemonIds("clefairy", "clefable", "cleffa", "staryu", "starmie", "lunatone", "solrock", "jirachi",
              "deoxys-normal", "elgyem", "beheeyem", "minior-red-meteor", "cosmog", "cosmoem", "solgaleo", "lunala",
              "necrozma"),
      category("japanese-folklore")
          .label("Inspirados en el folclore japonés")
          .explanation("Su diseño se basa en criaturas o leyendas del folclore japonés.")
          .pokemonIds("ninetales", "drowzee", "hypno", "lombre", "shiftry", "froslass", "tornadus-incarnate",
              "thundurus-incarnate", "ogerpon", "okidogi", "munkidori", "fezandipiti"),
      category("object-ghosts")
          .label("Fantasmas con forma de objeto")
          .explanation("Son de tipo Fantasma y su diseño es un objeto inanimado.")
          .pokemonIds("shuppet", "banette", "drifloon", "drifblim", "rotom", "cofagrigus", "litwick", "lampent",
              "chandelure", "honedge", "doublade", "aegislash-shield", "pumpkaboo-average", "gourgeist-average",
              "sandygast", "palossand", "dhelmise", "sinistea", "polteageist", "gimmighoul", "gholdengo",
              "poltchageist", "sinistcha"),
      category("dinosaurs")
          .label("Inspirados en dinosaurios")
          .explanation("Su diseño está inspirado en dinosaurios.")
          .pokemonIds("tropius", "cranidos", "rampardos", "shieldon", "bastiodon", "archen", "archeops", "tyrunt",
              "tyrantrum", "amaura", "aurorus", "dracozolt", "arctozolt"),
      category("lizards")
          .label("Pokémon con aspecto de lagarto")
          .explanation("Su diseño está inspirado en lagartos, lagartijas o camaleones.")
          .pokemonIds("charmander", "charmeleon", "treecko", "grovyle", "sceptile", "kecleon", "helioptile",
              "heliolisk", "salandit", "salazzle", "sobble", "drizzile", "inteleon", "cyclizar"),
      category("crocodiles")
          .label("Pokémon con aspecto de cocodrilo")
          .explanation("Su diseño está inspirado en cocodrilos o caimanes.")
          .pokemonIds("totodile", "croconaw", "feraligatr", "sandile", "krokorok", "krookodile"),
      category("beetles")
          .label("Pokémon con aspecto de escarabajo")
          .explanation("Su diseño está inspirado en escarabajos, mariquitas incluidas.")
          .pokemonIds("pinsir", "ledyba", "ledian", "heracross", "grubbin", "charjabug", "vikavolt", "blipbug",
              "dottler", "orbeetle", "rellor", "rabsca"),
      category("bees")
          .label("Abejas y avispas")
          .explanation("Su diseño está inspirado en abejas o avispas.")
          .pokemonIds("beedrill", "combee", "vespiquen", "cutiefly", "ribombee"),
      category("snails-slugs")
          .label("Caracoles y babosas")
          .explanation("Su diseño está inspirado en caracoles o babosas.")
          .pokemonIds("slugma", "magcargo", "shellos", "gastrodon", "shelmet", "accelgor", "goomy", "sliggoo",
              "goodra"),
      category("deer")
          .label("Pokémon con aspecto de ciervo")
          .explanation("Su diseño está inspirado en ciervos o renos.")
          .pokemonIds("stantler", "deerling", "sawsbuck", "xerneas", "wyrdeer"),
      category("fruits-vegetables")
          .label("Frutas y hortalizas")
          .explanation("Su diseño incluye frutas, verduras u hortalizas.")
          .pokemonIds("tropius", "cherubi", "cherrim", "pumpkaboo-average", "gourgeist-average", "bounsweet", "steenee",
              "tsareena", "applin", "flapple", "appletun", "smoliv", "dolliv", "arboliva", "capsakid", "scovillain",
              "dipplin", "hydrapple"),
      category("royalty")
          .label("Realeza")
          .explanation("Su nombre o su diseño alude a un rey, una reina o un emperador.")
          .pokemonIds("nidoqueen", "nidoking", "kingler", "seaking", "slowking", "kingdra", "vespiquen", "empoleon",
              "tsareena", "calyrex", "kingambit"),
      category("female-only")
          .label("Solo existen hembras")
          .explanation("Su especie no tiene ejemplares macho ni sin sexo.")
          .pokemonIds("nidoran-f", "nidorina", "nidoqueen", "chansey", "kangaskhan", "jynx", "smoochum", "miltank",
              "blissey", "illumise", "latias", "wormadam-plant", "vespiquen", "happiny", "froslass", "cresselia",
              "petilil", "lilligant", "vullaby", "mandibuzz", "flabebe", "floette", "florges", "salazzle", "bounsweet",
              "steenee", "tsareena", "hatenna", "hattrem", "hatterene", "milcery", "alcremie", "enamorus-incarnate",
              "tinkatink", "tinkatuff", "tinkaton", "ogerpon"),
      category("male-only")
          .label("Solo existen machos")
          .explanation("Su especie no tiene ejemplares hembra ni sin sexo.")
          .pokemonIds("nidoran-m", "nidorino", "nidoking", "hitmonlee", "hitmonchan", "tauros", "tyrogue", "hitmontop",
              "volbeat", "latios", "mothim", "gallade", "throh", "sawk", "rufflet", "braviary", "tornadus-incarnate",
              "thundurus-incarnate", "landorus-incarnate", "impidimp", "morgrem", "grimmsnarl", "oinkologne-male",
              "okidogi", "munkidori", "fezandipiti"),
      category("shape-head-only")
          .label("Solo tienen cabeza")
          .explanation("La Pokédex clasifica oficialmente su forma corporal como solo cabeza.")
          .pokemonIds("shellder", "cloyster", "gastly", "voltorb", "electrode", "koffing", "ditto", "sunkern",
              "misdreavus", "unown", "pineco", "forretress", "silcoon", "cascoon", "lunatone", "solrock", "castform",
              "shuppet", "glalie", "clamperl", "mismagius", "bronzor", "rotom", "whirlipede", "cottonee", "solosis",
              "duosion", "ferroseed", "cryogonal", "shelmet", "carbink", "klefki", "pumpkaboo-average", "comfey",
              "minior-red-meteor", "cosmog", "cosmoem", "meltan", "rolycoly", "sinistea", "polteageist", "milcery",
              "nacli", "tadbulb", "bramblin", "brambleghast", "glimmet", "glimmora", "poltchageist", "sinistcha",
              "pecharunt"),
      category("shape-multiple-bodies")
          .label("Formados por varios cuerpos")
          .explanation("La Pokédex clasifica oficialmente su forma corporal como varios cuerpos.")
          .pokemonIds("dugtrio", "magneton", "exeggcute", "weezing", "metagross", "combee", "cherubi", "probopass",
              "vanilluxe", "klink", "klang", "klinklang", "doublade", "binacle", "barbaracle", "falinks", "tandemaus",
              "maushold-family-of-four", "dipplin", "hydrapple"),
      category("shape-tentacles")
          .label("Forma corporal con tentáculos")
          .explanation("La Pokédex clasifica oficialmente su forma corporal como tentáculos.")
          .pokemonIds("tentacool", "tentacruel", "omanyte", "omastar", "octillery", "carnivine", "giratina-altered",
              "boldore", "gigalith", "frillish-male", "jellicent-male", "ferrothorn", "inkay", "trevenant", "toxapex",
              "wimpod", "nihilego", "buzzwole", "sizzlipede", "centiskorch", "clobbopus", "grapploct", "pincurchin",
              "toedscruel"),
      category("heavyweights")
          .label("Pesan 200 kg o más")
          .explanation("Su peso oficial alcanza al menos 200 kg.")
          .matches(pokemon -> pokemon.weightHectograms() >= 2_000),
      category("featherweights")
          .label("Pesan menos de 1 kg")
          .explanation("Su peso oficial no llega a 1 kg.")
          .matches(pokemon -> pokemon.weightHectograms() > 0 && pokemon.weightHectograms() < 10),
      category("giants")
          .label("Miden 3 metros o más")
          .explanation("Su altura oficial alcanza al menos 3 metros.")
          .matches(pokemon -> pokemon.heightDecimeters() >= 30));

  /** {@code connectionCuratedTemplates}. */
  static final List<CuratedTemplate> CURATED_TEMPLATES = List.of(
      template("classic-connections",
          group("eevee-family", "vaporeon", "jolteon", "flareon", "espeon"),
          group("fossils", "omanyte", "kabuto", "aerodactyl", "lileep"),
          group("dogs", "growlithe", "houndour", "electrike", "lillipup"),
          group("food", "vanillite", "slurpuff", "appletun", "alcremie")),
      template("companions-connections",
          group("cats", "meowth", "skitty", "glameow", "purrloin"),
          group("bears", "teddiursa", "cubchoo", "stufful", "kubfu"),
          group("baby", "pichu", "togepi", "riolu", "toxel"),
          group("pseudo-final", "dragonite", "tyranitar", "metagross", "garchomp")),
      template("first-partners-connections",
          group("grass-partners", "bulbasaur", "chikorita", "treecko", "turtwig"),
          group("fire-partners", "charmander", "cyndaquil", "torchic", "chimchar"),
          group("water-partners", "squirtle", "totodile", "mudkip", "piplup"),
          group("regional-birds", "pidgeot", "noctowl", "swellow", "staraptor")),
      template("evolution-methods-connections",
          group("trade-evolution", "kadabra", "machoke", "graveler", "haunter"),
          group("branch-evolution", "tyrogue", "wurmple", "nincada", "burmy"),
          group("friendship-evolution", "golbat", "chansey", "buneary", "riolu"),
          group("stone-evolution", "vulpix", "growlithe", "staryu", "sunkern")),
      template("animal-shapes-connections",
          group("turtles", "squirtle", "torkoal", "carracosta", "chewtle"),
          group("snakes", "ekans", "dunsparce", "seviper", "silicobra"),
          group("monkeys", "mankey", "aipom", "pansage", "grookey"),
          group("horses", "ponyta", "blitzle", "mudbray", "spectrier")),
      template("nature-connections",
          group("crustaceans", "krabby", "corphish", "dwebble", "klawf"),
          group("frogs", "politoed", "croagunk", "greninja", "bellibolt"),
          group("mythical-balanced-stats", "mew", "celebi", "jirachi", "manaphy"),
          group("electric-rodents", "plusle", "pachirisu", "dedenne", "togedemaru")),
      template("legendary-groups-connections",
          group("swords-of-justice", "cobalion", "terrakion", "virizion", "keldeo-ordinary"),
          group("forces-of-nature", "tornadus-incarnate", "thundurus-incarnate", "landorus-incarnate",
              "enamorus-incarnate"),
          group("tapu-guardians", "tapu-koko", "tapu-lele", "tapu-bulu", "tapu-fini"),
          group("treasures-of-ruin", "wo-chien", "chien-pao", "ting-lu", "chi-yu")),
      template("wildlife-connections",
          group("spiders", "spinarak", "joltik", "dewpider", "tarountula"),
          group("butterflies-moths", "butterfree", "beautifly", "mothim", "vivillon"),
          group("sheep-goats", "mareep", "skiddo", "wooloo", "dubwool"),
          group("ducks", "psyduck", "farfetchd", "ducklett", "quaxly")));

  private static Map<String, String> orderedLabels(String... keysAndLabels) {
    var labels = new LinkedHashMap<String, String>();
    for (int index = 0; index < keysAndLabels.length; index += 2) {
      labels.put(keysAndLabels[index], keysAndLabels[index + 1]);
    }
    return Collections.unmodifiableMap(labels);
  }

  /** {@code rotate}: {@code values} desde {@code offset % length}, dando la vuelta. */
  static <T> List<T> rotate(List<T> values, int offset) {
    if (values.isEmpty()) return List.of();
    int start = offset % values.size();
    var result = new ArrayList<T>(values.subList(start, values.size()));
    result.addAll(values.subList(0, start));
    return result;
  }

  /**
   * Familia de una categoría: todo lo que sale de los tipos es {@code types}; las de iniciales (y sus habilidades),
   * {@code starters}; cada grupo de prefijo ({@code ability-}, {@code letter-}, {@code generation-}) o de sufijo
   * ({@code -evolution}) comparte familia; el resto, la de {@link #FAMILY_BY_ID} o su propio id.
   */
  static String categoryFamily(String categoryId) {
    var family = FAMILY_BY_ID.get(categoryId);
    if (family != null) return family;
    if (categoryId.startsWith("type-") || categoryId.startsWith("mono-") || categoryId.startsWith("dual-")) {
      return "types";
    }
    for (var prefix : List.of("ability-", "letter-", "generation-")) {
      if (categoryId.startsWith(prefix)) return prefix.substring(0, prefix.length() - 1);
    }
    if (categoryId.endsWith("-evolution")) return "evolution-method";
    return categoryId;
  }

  /** Inicial del nombre mostrado, en mayúscula y sin tildes. */
  private static String nameInitial(Pokemon pokemon) {
    var name = pokemon.name();
    if (name == null || name.isEmpty()) return "";
    var plain = Normalizer.normalize(name.substring(0, 1), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    return plain.toUpperCase(Locale.ROOT);
  }

  /**
   * {@code resolvedCategoryDefinitions}: las curadas y después las dinámicas (tipos, monotipos, dobles tipos,
   * evolución, rareza, número de tipos, estadísticas, habilidades, inicial del nombre, altura y, si el pool trae más de
   * una generación, la generación de debut), sin repetir id.
   */
  static List<CategoryDefinition> resolvedCategoryDefinitions(List<Pokemon> pool) {
    var availableGenerations = new HashSet<Integer>();
    for (var pokemon : pool) availableGenerations.add(pokemon.generation());
    var dynamic = new ArrayList<CategoryDefinition>();
    TYPE_LABELS.forEach((type, label) -> dynamic.add(category("type-" + type)
        .label("Comparten el tipo " + label)
        .explanation("Todos incluyen el tipo " + label + " entre sus tipos.")
        .matches(pokemon -> pokemon.types().contains(type))));
    TYPE_LABELS.forEach((type, label) -> dynamic.add(category("mono-" + type)
        .label("Solo son de tipo " + label)
        .explanation("Tienen un único tipo: " + label + ".")
        .matches(pokemon -> pokemon.types().size() == 1 && pokemon.types().contains(type))));
    for (var pair : DUAL_TYPES) {
      var first = TYPE_LABELS.get(pair.get(0));
      var second = TYPE_LABELS.get(pair.get(1));
      dynamic.add(category("dual-" + pair.get(0) + "-" + pair.get(1))
          .label("Son de tipo " + first + " y " + second)
          .explanation("Combinan exactamente los tipos " + first + " y " + second + ".")
          .matches(pokemon -> pokemon.types().size() == 2 && pokemon.types().containsAll(pair)));
    }
    dynamic.add(category("evolution-first")
        .label("Primera fase evolutiva")
        .explanation("Ocupan la primera fase de una familia con varias etapas.")
        .matches(pokemon -> Objects.equals(pokemon.evolutionStage(), 1) && stageCount(pokemon) > 1));
    dynamic.add(category("evolution-final")
        .label("Evoluciones finales")
        .explanation("Ocupan la última fase de su familia evolutiva.")
        .matches(pokemon -> stageCount(pokemon) > 1
            && Objects.equals(pokemon.evolutionStage(), pokemon.evolutionStageCount())));
    dynamic.add(category("single-stage")
        .label("Sin evoluciones")
        .explanation("No evolucionan ni proceden de otro Pokémon.")
        .matches(pokemon -> stageCount(pokemon) == 1));
    dynamic.add(category("legendary")
        .label("Pokémon legendarios")
        .explanation("Tienen la clasificación oficial de Pokémon legendario.")
        .matches(pokemon -> "LEGENDARY".equals(pokemon.legendaryStatus())));
    dynamic.add(category("mythical")
        .label("Pokémon singulares")
        .explanation("Tienen la clasificación oficial de Pokémon singular.")
        .matches(pokemon -> "MYTHICAL".equals(pokemon.legendaryStatus())));
    dynamic.add(category("ordinary")
        .label("No son legendarios ni singulares")
        .explanation("Tienen la clasificación oficial de Pokémon común.")
        .matches(pokemon -> "NORMAL".equals(pokemon.legendaryStatus())));
    dynamic.add(category("single-type")
        .label("Tienen un único tipo")
        .explanation("Solo poseen un tipo elemental en su forma mostrada.")
        .matches(pokemon -> pokemon.types().size() == 1));
    dynamic.add(category("dual-type")
        .label("Tienen dos tipos")
        .explanation("Poseen exactamente dos tipos elementales en su forma mostrada.")
        .matches(pokemon -> pokemon.types().size() == 2));
    dynamic.add(category("bst-600-plus")
        .label("Suma de estadísticas de 600 o más")
        .explanation("La suma de sus seis estadísticas base alcanza al menos 600 puntos.")
        .matches(pokemon -> pokemon.baseStatTotal() >= 600));
    dynamic.add(category("speed-100-plus")
        .label("Velocidad base de 100 o más")
        .explanation("Su estadística base de Velocidad alcanza al menos 100 puntos.")
        .matches(pokemon -> pokemon.speed() >= 100));
    dynamic.add(category("same-defenses")
        .label("Defensas base idénticas")
        .explanation("Su Defensa y su Defensa Especial tienen exactamente el mismo valor base.")
        .matches(pokemon -> pokemon.defense() == pokemon.specialDefense()));
    ABILITY_LABELS.forEach((id, ability) -> dynamic.add(category("ability-" + id)
        .label("Pueden tener la habilidad " + ability)
        .explanation(ability + " está entre sus habilidades posibles, contando la oculta.")
        .matches(pokemon -> pokemon.abilities() != null && pokemon.abilities().contains(ability))));
    for (var initial : NAME_INITIALS) {
      dynamic.add(category("letter-" + initial.toLowerCase(Locale.ROOT))
          .label("Su nombre empieza por " + initial)
          .explanation("El nombre de todos empieza por la letra " + initial + ".")
          .matches(pokemon -> initial.equals(nameInitial(pokemon))));
    }
    dynamic.add(category("tiny")
        .label("Miden 30 cm o menos")
        .explanation("Su altura oficial no pasa de 30 cm.")
        .matches(pokemon -> pokemon.heightDecimeters() > 0 && pokemon.heightDecimeters() <= 3));
    if (availableGenerations.size() > 1) {
      for (int generation = 1; generation <= 9; generation++) {
        int debut = generation;
        dynamic.add(category("generation-" + generation)
            .label("Debutaron en la generación " + generation)
            .explanation("Todos aparecieron por primera vez en la generación " + generation + ".")
            .matches(pokemon -> pokemon.generation() == debut));
      }
    }
    // [...catalog, ...dynamic].filter(primera aparición de cada id).
    var byId = new LinkedHashMap<String, CategoryDefinition>();
    for (var definition : CONNECTION_CATEGORY_CATALOG) byId.putIfAbsent(definition.id(), definition);
    for (var definition : dynamic) byId.putIfAbsent(definition.id(), definition);
    return List.copyOf(byId.values());
  }

  /** {@code pokemon.evolutionStageCount ?? 1}. */
  private static int stageCount(Pokemon pokemon) {
    return pokemon.evolutionStageCount() == null ? 1 : pokemon.evolutionStageCount();
  }

  static List<Pokemon> membersFor(CategoryDefinition definition, List<Pokemon> pool) {
    return pool.stream().filter(definition::includes).toList();
  }

  private static ConnectionAnswerGroup answerGroup(CategoryDefinition definition, List<Pokemon> pokemon, int index) {
    return ConnectionAnswerGroup.of(definition, index, pokemon.stream().map(ConnectionPokemon::of).toList());
  }

  /** {@code curatedCandidates}: cada plantilla (o cada rotación, si sobran grupos) cuyos Pokémon estén en el pool. */
  static List<GeneratedConnectionsPuzzle> curatedCandidates(List<Pokemon> pool, int groupCount) {
    var byId = new HashMap<String, Pokemon>();
    for (var pokemon : pool) byId.put(pokemon.id(), pokemon);
    var definitions = new HashMap<String, CategoryDefinition>();
    for (var definition : CONNECTION_CATEGORY_CATALOG) definitions.put(definition.id(), definition);
    var result = new ArrayList<GeneratedConnectionsPuzzle>();
    for (var template : CURATED_TEMPLATES) {
      int size = template.groups().size();
      int offsets = size == groupCount ? 1 : size > groupCount ? size : 0;
      for (int offset = 0; offset < offsets; offset++) {
        var chosen = rotate(template.groups(), offset).subList(0, Math.min(groupCount, size));
        var groups = new ArrayList<ConnectionAnswerGroup>();
        boolean resolved = true;
        for (var group : chosen) {
          var definition = definitions.get(group.categoryId());
          var pokemon = group.pokemonIds().stream().map(byId::get).toList();
          if (definition == null || pokemon.contains(null)) {
            resolved = false;
            break;
          }
          groups.add(answerGroup(definition, pokemon, groups.size()));
        }
        if (!resolved) continue;
        var key = template.id() + "-" + String.join("-", chosen.stream().map(TemplateGroup::categoryId).toList());
        result.add(new GeneratedConnectionsPuzzle(key, "CURATED", groups));
      }
    }
    return result;
  }

  /** Una categoría candidata con sus miembros barajados y el conjunto de sus ids, para la regla de ambigüedad. */
  private record Candidate(CategoryDefinition definition, List<Pokemon> members, Set<String> memberIds) {

    Candidate(CategoryDefinition definition, List<Pokemon> members) {
      this(definition, members, memberIdsOf(members));
    }

    private static Set<String> memberIdsOf(List<Pokemon> members) {
      var ids = new HashSet<String>();
      for (var pokemon : members) ids.add(pokemon.id());
      return Collections.unmodifiableSet(ids);
    }
  }

  /**
   * {@code dynamicPuzzle}: baraja los miembros de cada categoría (también los de las que luego no llegan a
   * {@code groupSize}), después las candidatas no excluidas y las excluidas, y prueba rotaciones sin consumir azar:
   * primero sin repetir familia ({@link #categoryFamily}) en el tablero y, si así no sale ninguno, sin esa regla.
   * Cada Pokémon del tablero encaja en una sola de las categorías elegidas: se salta la categoría en la que ya encaja
   * un Pokémon del tablero, y no se eligen Pokémon de una categoría ya elegida.
   */
  private static @Nullable GeneratedConnectionsPuzzle dynamicPuzzle(List<Pokemon> pool, int groupSize, int groupCount,
      DoubleSupplier random, Set<String> excludedCategoryIds, Set<String> usedPuzzleKeys) {
    var candidates = new ArrayList<Candidate>();
    for (var definition : resolvedCategoryDefinitions(pool)) {
      var members = Randoms.shuffled(membersFor(definition, pool), random);
      if (members.size() >= groupSize) candidates.add(new Candidate(definition, members));
    }
    var randomized = new ArrayList<Candidate>(Randoms.shuffled(candidates.stream()
        .filter(candidate -> !excludedCategoryIds.contains(candidate.definition().id())).toList(), random));
    randomized.addAll(Randoms.shuffled(candidates.stream()
        .filter(candidate -> excludedCategoryIds.contains(candidate.definition().id())).toList(), random));
    var varied = searchPuzzle(randomized, groupSize, groupCount, usedPuzzleKeys, true);
    return varied != null ? varied : searchPuzzle(randomized, groupSize, groupCount, usedPuzzleKeys, false);
  }

  /** Las rotaciones de {@code dynamicPuzzle}; con {@code distinctFamilies}, una sola categoría por familia. */
  private static @Nullable GeneratedConnectionsPuzzle searchPuzzle(List<Candidate> randomized, int groupSize,
      int groupCount, Set<String> usedPuzzleKeys, boolean distinctFamilies) {
    for (int attempt = 0; attempt < Math.max(1, randomized.size() * 4); attempt += 1) {
      var used = new HashSet<String>();
      var chosen = new ArrayList<Set<String>>();
      var families = new HashSet<String>();
      var groups = new ArrayList<ConnectionAnswerGroup>();
      for (var candidate : rotate(randomized, attempt)) {
        var family = categoryFamily(candidate.definition().id());
        if (distinctFamilies && families.contains(family)) continue;
        if (used.stream().anyMatch(candidate.memberIds()::contains)) continue;
        var available = rotate(candidate.members(), attempt + groups.size()).stream()
            .filter(pokemon -> chosen.stream().noneMatch(memberIds -> memberIds.contains(pokemon.id())))
            .toList();
        if (available.size() < groupSize) continue;
        var selected = available.subList(0, groupSize);
        selected.forEach(pokemon -> used.add(pokemon.id()));
        chosen.add(candidate.memberIds());
        families.add(family);
        groups.add(answerGroup(candidate.definition(), selected, groups.size()));
        if (groups.size() == groupCount) {
          // .sort() de JS sin comparador: orden de unidades UTF-16, el de String.compareTo.
          var signature = String.join("|", groups.stream()
              .map(group -> group.categoryId() + ":" + String.join(",",
                  group.pokemon().stream().map(ConnectionPokemon::id).sorted().toList()))
              .sorted()
              .toList());
          var puzzle = new GeneratedConnectionsPuzzle("dynamic-" + signature, "DYNAMIC", groups);
          if (!usedPuzzleKeys.contains(puzzle.key())) return puzzle;
          break;
        }
      }
    }
    return null;
  }

  /** Opciones de {@code generateConnectionsPuzzle}. */
  record PuzzleOptions(int groupSize, int pokemonCount, List<Integer> generations, List<String> usedPuzzleKeys,
      List<String> excludedCategoryIds) {}

  /**
   * {@code generateConnectionsPuzzle}: siempre se intenta primero un puzle dinámico, para que cada partida mezcle
   * categorías distintas. Solo si no sale ninguno nuevo se recurre a una plantilla curada (con grupos de 4 y tableros
   * de 12 o 16): una no vista si queda, o cualquiera. Sin plantilla posible, error.
   */
  static GeneratedConnectionsPuzzle generateConnectionsPuzzle(GameContext context, PuzzleOptions options) {
    var pool = context.pokemon().forGenerations(options.generations()).stream()
        .filter(pokemon -> pokemon.isDefault() && pokemon.sprite() != null && !pokemon.sprite().isEmpty())
        .toList();
    if (options.pokemonCount() % options.groupSize() != 0) {
      throw new EngineException("El tamaño del tablero no forma grupos completos.");
    }
    int groupCount = options.pokemonCount() / options.groupSize();
    Set<String> used = new HashSet<>(options.usedPuzzleKeys());
    Set<String> excludedCategoryIds = new HashSet<>(options.excludedCategoryIds());
    var random = context.random();
    var generated = dynamicPuzzle(pool, options.groupSize(), groupCount, random, excludedCategoryIds, used);
    if (generated != null) return generated;
    List<GeneratedConnectionsPuzzle> curatedFallback = List.of();
    if (options.groupSize() == 4 && (options.pokemonCount() == 12 || options.pokemonCount() == 16)) {
      var curated = curatedCandidates(pool, groupCount);
      var fresh = curated.stream().filter(puzzle -> !used.contains(puzzle.key())).toList();
      curatedFallback = !fresh.isEmpty() ? fresh : curated;
    }
    if (!curatedFallback.isEmpty()) {
      return curatedFallback.get((int) Math.floor(random.getAsDouble() * curatedFallback.size()));
    }
    throw new EngineException("No se puede construir un puzle válido con estas generaciones y tamaño. Amplía las "
        + "generaciones o reduce el tablero.");
  }

  /** {@code shuffledConnectionsBoard}: los Pokémon de todos los grupos, barajados. */
  static List<ConnectionPokemon> shuffledConnectionsBoard(List<ConnectionAnswerGroup> groups, DoubleSupplier random) {
    return Randoms.shuffled(groups.stream().flatMap(group -> group.pokemon().stream()).toList(), random);
  }
}
