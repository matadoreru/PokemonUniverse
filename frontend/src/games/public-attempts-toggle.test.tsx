import {
  defaultGuessFromStatsConfig,
  defaultPokeTabooConfig,
  defaultPokedexEntryGuessConfig,
  defaultPokemonCryQuizConfig,
  defaultPokemonPaletteGuessConfig,
  defaultSketchmonConfig,
  defaultWhosThatPokemonConfig,
  defaultZoomedPokemonConfig,
} from '@pokemon-universe/shared/public';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuessFromStatsConfigPanel } from './guess-from-stats/ConfigPanel';
import { PokeTabooConfigPanel } from './poke-taboo/ConfigPanel';
import { PokedexEntryGuessConfigPanel } from './pokedex-entry-guess/ConfigPanel';
import { PokemonCryQuizConfigPanel } from './pokemon-cry-quiz/ConfigPanel';
import { PokemonPaletteGuessConfigPanel } from './pokemon-palette-guess/ConfigPanel';
import { SketchmonConfigPanel } from './sketchmon/ConfigPanel';
import { WhosThatPokemonConfigPanel } from './whos-that-pokemon/ConfigPanel';
import { ZoomedPokemonConfigPanel } from './zoomed-pokemon/ConfigPanel';

type Panel = ComponentType<{ config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }>;

/** Los ocho juegos de adivinar con el panel «Intentos públicos». */
const panels: [string, Panel, Record<string, unknown>][] = [
  ['zoomed-pokemon', ZoomedPokemonConfigPanel, defaultZoomedPokemonConfig],
  ['sketchmon', SketchmonConfigPanel, defaultSketchmonConfig],
  ['pokedex-entry-guess', PokedexEntryGuessConfigPanel, defaultPokedexEntryGuessConfig],
  ['whos-that-pokemon', WhosThatPokemonConfigPanel, defaultWhosThatPokemonConfig],
  ['pokemon-palette-guess', PokemonPaletteGuessConfigPanel, defaultPokemonPaletteGuessConfig],
  ['pokemon-cry-quiz', PokemonCryQuizConfigPanel, defaultPokemonCryQuizConfig],
  ['guess-from-stats', GuessFromStatsConfigPanel, defaultGuessFromStatsConfig],
  ['poke-taboo', PokeTabooConfigPanel, defaultPokeTabooConfig],
];

const render = (Panel: Panel, config: unknown) => renderToStaticMarkup(createElement(Panel, { config, disabled: false, onChange: async () => undefined }));

/** El interruptor «Intentos públicos» (su `<button role="switch">` con la etiqueta y la ayuda). */
function publicAttemptsSwitch(html: string): string | undefined {
  return html.match(/<button[^>]*role="switch"[^>]*>(?:(?!<\/button>).)*Intentos públicos(?:(?!<\/button>).)*<\/button>/)?.[0];
}

describe('Ajuste «Intentos públicos» de los juegos de adivinar', () => {
  it.each(panels)('%s: interruptor encendido por defecto, con su ayuda', (_game, Panel, config) => {
    const toggle = publicAttemptsSwitch(render(Panel, config));
    expect(toggle).toBeDefined();
    expect(toggle).toContain('aria-checked="true"');
    expect(toggle).toContain('Si lo apagas, nadie ve los fallos de los demás.');
  });

  it.each(panels)('%s: apagado se pinta apagado; una configuración guardada sin la clave, encendido', (_game, Panel, config) => {
    expect(publicAttemptsSwitch(render(Panel, { ...config, publicAttempts: false }))).toContain('aria-checked="false"');
    const stored = { ...config };
    delete stored.publicAttempts;
    expect(publicAttemptsSwitch(render(Panel, stored))).toContain('aria-checked="true"');
  });
});
