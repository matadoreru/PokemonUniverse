package es.pokemonuniverse.domain.game.engines.oneofusisfake;

import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import java.util.ArrayList;
import java.util.List;

/**
 * {@code officialSubjectiveCategories}, antes en {@code one-of-us-is-fake/categories.ts}: las categorías en el mismo
 * orden (el orden alimenta la elección aleatoria) con ids {@code official-NN}. Son textos subjetivos, nunca reglas de
 * validación.
 */
public final class OneOfUsIsFakeCategories {

  private static final List<String> TEXTS = List.of(
      "Pokémon que parecen mascotas",
      "Pokémon que parecen peligrosos",
      "Pokémon que darían miedo encontrarse de noche",
      "Pokémon que llevarías de vacaciones",
      "Pokémon que llevarías a una isla desierta",
      "Pokémon que elegirías como guardaespaldas",
      "Pokémon que serían buenos compañeros de piso",
      "Pokémon que no dejarías entrar en tu casa",
      "Pokémon que llevarías a una fiesta",
      "Pokémon que parecen villanos",
      "Pokémon que parecen héroes",
      "Pokémon que parecen muy inteligentes",
      "Pokémon que parecen bastante tontos",
      "Pokémon que parecen más fuertes de lo que realmente son",
      "Pokémon que parecen adorables",
      "Pokémon que parecen juguetes",
      "Pokémon que parecen comida",
      "Pokémon que usarías como almohada",
      "Pokémon que usarías como montura",
      "Pokémon que podrían protagonizar una película",
      "Pokémon que podrían ser una mascota famosa",
      "Pokémon que parecen de otro planeta",
      "Pokémon que podrían vivir perfectamente en una ciudad",
      "Pokémon que parecen caros",
      "Pokémon que parecen pobres",
      "Pokémon que parecen perros",
      "Pokémon que parecen gatos",
      "Pokémon que parecen dragones",
      "Pokémon que parecen robots",
      "Pokémon que parecen dinosaurios",
      "Pokémon que parecen animales marinos",
      "Pokémon que llevarías a una cita",
      "Pokémon que elegirías para una pelea",
      "Pokémon con los que te irías de aventura",
      "Pokémon en los que confiarías",
      "Pokémon de los que desconfiarías",
      "Pokémon que podrían trabajar en un hospital",
      "Pokémon que podrían trabajar de policía",
      "Pokémon que podrían cocinar bien",
      "Pokémon que serían malos profesores",
      "Pokémon que parecen tener mucho dinero",
      "Pokémon que probablemente romperían cosas en tu casa",
      "Pokémon que adoptarías",
      "Pokémon que jamás adoptarías",
      "Pokémon que parecen tener mal carácter",
      "Pokémon que parecen muy tranquilos",
      "Pokémon con los que te gustaría viajar",
      "Pokémon que podrían ser buenos influencers",
      "Pokémon que parecen jefes finales"
  );

  public static final List<SubjectiveCategory> OFFICIAL = official();

  private OneOfUsIsFakeCategories() {}

  private static List<SubjectiveCategory> official() {
    var categories = new ArrayList<SubjectiveCategory>();
    for (int index = 0; index < TEXTS.size(); index++) {
      categories.add(new SubjectiveCategory("official-" + String.format("%02d", index + 1), TEXTS.get(index)));
    }
    return List.copyOf(categories);
  }
}
