import { describe, expect, it } from 'vitest';
import { gameHowToPlay } from './how-to-play';

/** Títulos literales de los pasos (MINIJUEGOS_MEJORAS.md, §x.4 y §8.1). */
const titles: Record<string, readonly [string, string, string]> = {
  'pokedex-distance': ['Te damos un número de Pokédex', 'Elige el Pokémon cuyo número esté más cerca', 'El más lejano cae. El último en pie gana'],
  'shiny-vote': ['Uno de estos es el shiny oficial', 'Los demás están recoloreados', 'Cuanto antes aciertes, más puntos (4/3/2/1)'],
  'pokemon-impostor': ['Todos menos el impostor ven el Pokémon', 'Da una pista corta sin decir el nombre', 'Votad al sospechoso; el impostor gana si adivina el Pokémon o iguala en número'],
  'higher-lower': ['Mira la stat del Pokémon de la izquierda', '¿El de la derecha la tiene mayor, menor o igual?', 'Igual vale más puntos y las rachas dan bonus'],
  'type-duel': ['Cada uno elige un tipo en secreto', 'Juntos forman una combinación: encuentra un Pokémon que la tenga EXACTA', 'El primero que acierte gana 5 puntos'],
  'learnset-guess': ['Ves los movimientos que aprende un Pokémon por nivel', 'Cada 7 s se revelan más', 'Cuanto antes aciertes, más puntos'],
};

describe('gameHowToPlay', () => {
  it('tiene los 3 pasos de los 6 juegos con el título literal', () => {
    expect(Object.keys(gameHowToPlay).sort()).toEqual(Object.keys(titles).sort());
    for (const [gameId, expected] of Object.entries(titles)) {
      const slides = gameHowToPlay[gameId]!;
      expect(slides.map((slide) => slide.title), gameId).toEqual(expected);
      expect(slides.map((slide) => slide.eyebrow), gameId).toEqual(['Paso 1 de 3', 'Paso 2 de 3', 'Paso 3 de 3']);
      for (const slide of slides) expect(slide.description.length, `${gameId}: ${slide.title}`).toBeGreaterThan(0);
    }
  });

  it('avisa de las reglas que deciden la ronda sin jugar', () => {
    expect(gameHowToPlay['pokemon-impostor']![2].description).toContain('3 rondas seguidas sin expulsar a nadie');
    expect(gameHowToPlay['type-duel']![0].description).toContain('Si no eliges a tiempo');
    expect(gameHowToPlay['pokedex-distance']![2].description).toContain('Si no respondes, caes');
  });
});
