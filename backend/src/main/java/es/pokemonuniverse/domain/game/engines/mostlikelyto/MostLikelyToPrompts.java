package es.pokemonuniverse.domain.game.engines.mostlikelyto;

import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import java.util.ArrayList;
import java.util.List;

/**
 * {@code officialMostLikelyToPrompts}, antes en {@code most-likely-to/prompts.ts}: las preguntas en el mismo orden (el
 * orden alimenta la elección aleatoria) con ids {@code most-likely-to-official-NN}.
 */
public final class MostLikelyToPrompts {

  private static final List<String> TEXTS = List.of(
      "¿Qué Pokémon sería más probable que llegase tarde a una cita?",
      "¿Qué Pokémon sería más probable que olvidase tu cumpleaños?",
      "¿Qué Pokémon sería más probable que se convirtiese en influencer?",
      "¿Qué Pokémon sería más probable que rompiese algo en tu casa?",
      "¿Qué Pokémon sería más probable que ganase un concurso de cocina?",
      "¿Qué Pokémon sería más probable que sobreviviese en una isla desierta?",
      "¿Qué Pokémon sería más probable que fuese un villano secreto?",
      "¿Qué Pokémon sería más probable que durmiese durante una reunión importante?",
      "¿Qué Pokémon sería más probable que se hiciese amigo de todo el mundo?",
      "¿Qué Pokémon sería más probable que iniciase una discusión absurda?",
      "¿Qué Pokémon sería más probable que dominase el mundo?",
      "¿Qué Pokémon sería más probable que contase el peor chiste?",
      "¿Qué Pokémon sería más probable que guardase bien un secreto?",
      "¿Qué Pokémon sería más probable que se perdiese usando un mapa?",
      "¿Qué Pokémon sería más probable que apareciese con un regalo inesperado?",
      "¿Qué Pokémon sería más probable que llegase primero a una emergencia?",
      "¿Qué Pokémon sería más probable que se colase en una fiesta?",
      "¿Qué Pokémon sería más probable que protagonizase una película de acción?",
      "¿Qué Pokémon sería más probable que fuese un profesor estricto?",
      "¿Qué Pokémon sería más probable que adoptase diez mascotas?",
      "¿Qué Pokémon sería más probable que cantase en un karaoke?",
      "¿Qué Pokémon sería más probable que se hiciese millonario?",
      "¿Qué Pokémon sería más probable que trabajase de detective?",
      "¿Qué Pokémon sería más probable que organizase el mejor viaje?",
      "¿Qué Pokémon sería más probable que pulsase un botón prohibido?",
      "¿Qué Pokémon sería más probable que se quedase dormido viendo una película?",
      "¿Qué Pokémon sería más probable que ganase unas elecciones?",
      "¿Qué Pokémon sería más probable que fuese un compañero de piso desastroso?",
      "¿Qué Pokémon sería más probable que te defendiese en una pelea?",
      "¿Qué Pokémon sería más probable que desapareciese sin despedirse?",
      "¿Qué Pokémon sería más probable que montase su propio restaurante?",
      "¿Qué Pokémon sería más probable que tuviese una identidad secreta?",
      "¿Qué Pokémon sería más probable que ganase un reality show?",
      "¿Qué Pokémon sería más probable que se riese en el peor momento?",
      "¿Qué Pokémon sería más probable que se convirtiese en alcalde?",
      "¿Qué Pokémon sería más probable que inventase algo revolucionario?",
      "¿Qué Pokémon sería más probable que viviese en una mansión encantada?",
      "¿Qué Pokémon sería más probable que cuidase bien de un bebé?",
      "¿Qué Pokémon sería más probable que llegase a una fiesta con comida?",
      "¿Qué Pokémon sería más probable que fuese el jefe final?"
  );

  public static final List<SubjectiveCategory> OFFICIAL = official();

  private MostLikelyToPrompts() {}

  private static List<SubjectiveCategory> official() {
    var prompts = new ArrayList<SubjectiveCategory>();
    for (int index = 0; index < TEXTS.size(); index++) {
      prompts.add(new SubjectiveCategory("most-likely-to-official-" + String.format("%02d", index + 1),
          TEXTS.get(index)));
    }
    return List.copyOf(prompts);
  }
}
