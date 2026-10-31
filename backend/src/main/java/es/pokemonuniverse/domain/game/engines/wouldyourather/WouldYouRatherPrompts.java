package es.pokemonuniverse.domain.game.engines.wouldyourather;

import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import java.util.ArrayList;
import java.util.List;

/**
 * {@code officialWouldYouRatherPrompts} de {@code would-you-rather/prompts.ts}: las parejas en el mismo orden (el orden
 * alimenta la elección aleatoria) con ids {@code would-you-rather-official-NN}.
 */
public final class WouldYouRatherPrompts {

  private static final List<List<String>> PAIRS = List.of(
      List.of("Que Gengar cuente tu historial de búsqueda en una cena familiar",
          "Que Mr. Mime lo represente entero con mímica"),
      List.of("Compartir piso con Snorlax y pagar tú todo el alquiler",
          "Compartir piso con Rotom y que controle todos tus electrodomésticos"),
      List.of("Que Hypno sea tu terapeuta",
          "Que Slowpoke sea tu asesor financiero"),
      List.of("Que Meowth haga tu declaración de la renta",
          "Que Psyduck gestione tu hipoteca"),
      List.of("Tener a Absol avisándote de cada desgracia",
          "Tener a Xatu sabiendo exactamente cómo vas a morir"),
      List.of("Que Banette ordene tu armario cada noche",
          "Que Cofagrigus elija el diseño de tu ataúd"),
      List.of("Trabajar para el Team Rocket con contrato indefinido",
          "Ser autónomo y cobrar siempre en Pokédolares"),
      List.of("Ir a una cita mientras Gardevoir lee tus pensamientos",
          "Ir a una entrevista mientras Zoroark suplanta a tu ex"),
      List.of("Que Haunter te haga cosquillas cada vez que mientes",
          "Que Hatterene aparezca cada vez que pierdes la paciencia"),
      List.of("Dormir abrazado a un Slugma",
          "Ducharte siempre con un Cryogonal"),
      List.of("Tener un Magikarp que habla sin parar",
          "Tener un Gengar viviendo dentro de tu armario"),
      List.of("Que Ditto sustituya a tu jefe durante un mes",
          "Que Zoroark sustituya a todos tus compañeros de trabajo"),
      List.of("Saber el día exacto en que te despedirán gracias a Xatu",
          "No volver a entender ninguna indirecta por culpa de Slowpoke"),
      List.of("Que Mimikyu diseñe tu perfil de citas",
          "Que Sableye elija todos tus regalos de aniversario"),
      List.of("Una cena romántica cocinada por Muk",
          "Un desayuno de empresa servido por Garbodor"),
      List.of("Que Alakazam recuerde cada cosa vergonzosa que has dicho",
          "Que Chatot la repita cuando conoce a alguien nuevo"),
      List.of("Tener a Jigglypuff como vecino con karaoke nocturno",
          "Tener a Exploud como despertador sin botón de apagar"),
      List.of("Que Drowzee revise tus sueños en una pantalla pública",
          "Que Rotom publique tus notas del móvil una vez al año"),
      List.of("Venderle tu alma a Giratina por vacaciones ilimitadas",
          "Trabajar los domingos para Arceus por una nómina mediocre"),
      List.of("Que Greedent controle tu despensa",
          "Que Trubbish decida cuándo toca limpiar la casa"),
      List.of("Llegar a todas partes montado en un Rapidash enfadado",
          "Llegar siempre tarde sobre un Slowpoke encantador"),
      List.of("Tener la suerte de Togepi pero estornudar fuego",
          "Tener la fuerza de Machamp pero cuatro veces más agujetas"),
      List.of("Que Porygon organice tu vida digital",
          "Que Klefki guarde todas tus contraseñas"),
      List.of("Perder una discusión contra un Psyduck",
          "Recibir consejos amorosos de un Luvdisc"),
      List.of("Que Cubone escriba tu discurso de boda",
          "Que Spiritomb prepare el brindis"),
      List.of("Vivir un año en una casa encantada con Litwick",
          "Pasar un mes de camping con Parasect"),
      List.of("Tener un Eevee que cambie de evolución cada lunes",
          "Tener un Castform que controle el tiempo según su humor"),
      List.of("Que Machoke sea tu entrenador personal",
          "Que Slaking sea tu coach de productividad"),
      List.of("Cruzar el océano sobre Lapras",
          "Atravesar el cielo agarrado a Drifblim"),
      List.of("Participar en un concurso de cocina con Scovillain",
          "Participar en un karaoke con Meloetta"),
      List.of("Explorar una cueva con Umbreon",
          "Explorar un bosque con Decidueye"),
      List.of("Tener a Dragonite como repartidor personal",
          "Tener a Corviknight como taxi diario"),
      List.of("Aprender teletransporte con Abra",
          "Aprender a respirar bajo el agua con Vaporeon"),
      List.of("Cuidar una guardería llena de Toxel",
          "Organizar una excursión escolar con Impidimp"),
      List.of("Que Smeargle pinte todas las paredes de tu casa",
          "Que Sudowoodo decore todo tu jardín"),
      List.of("Compartir tus snacks con Munchlax",
          "Compartir tu conexión wifi con Porygon-Z")
  );

  public static final List<WouldYouRatherPromptPair> OFFICIAL = official();

  private WouldYouRatherPrompts() {}

  private static List<WouldYouRatherPromptPair> official() {
    var prompts = new ArrayList<WouldYouRatherPromptPair>();
    for (int index = 0; index < PAIRS.size(); index++) {
      var pair = PAIRS.get(index);
      prompts.add(new WouldYouRatherPromptPair("would-you-rather-official-" + String.format("%02d", index + 1),
          pair.get(0), pair.get(1)));
    }
    return List.copyOf(prompts);
  }
}
