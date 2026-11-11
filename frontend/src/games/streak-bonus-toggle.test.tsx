import { defaultPokemonCryQuizConfig, defaultPokemonPaletteGuessConfig, defaultWhosThatPokemonConfig } from '@pokemon-universe/shared/public';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonCryQuizConfigPanel } from './pokemon-cry-quiz/ConfigPanel';
import { PokemonPaletteGuessConfigPanel } from './pokemon-palette-guess/ConfigPanel';
import { WhosThatPokemonConfigPanel } from './whos-that-pokemon/ConfigPanel';
import { GuessStreakChip, guessStreakLabel, speedPodiumSolveDetail } from '../room/guess-kit';

type Panel = ComponentType<{ config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }>;

/** Los tres juegos que puntúan con `SpeedPodiumScore` y tienen el ajuste «Rachas» (E6). */
const panels: [string, Panel, Record<string, unknown>][] = [
  ['whos-that-pokemon', WhosThatPokemonConfigPanel, defaultWhosThatPokemonConfig],
  ['pokemon-palette-guess', PokemonPaletteGuessConfigPanel, defaultPokemonPaletteGuessConfig],
  ['pokemon-cry-quiz', PokemonCryQuizConfigPanel, defaultPokemonCryQuizConfig],
];

const render = (Panel: Panel, config: unknown) => renderToStaticMarkup(createElement(Panel, { config, disabled: false, onChange: async () => undefined }));

function streakSwitch(html: string): string | undefined {
  return html.match(/<button[^>]*role="switch"[^>]*>(?:(?!<\/button>).)*Rachas(?:(?!<\/button>).)*<\/button>/)?.[0];
}

describe('Ajuste «Rachas» (E6)', () => {
  it.each(panels)('%s: apagado por defecto y sin la clave; encendido si se marca', (_game, Panel, config) => {
    expect(config.streakBonus).toBe(false);
    expect(streakSwitch(render(Panel, config))).toContain('aria-checked="false"');
    expect(streakSwitch(render(Panel, config))).toContain('hasta +3');
    const stored = { ...config };
    delete stored.streakBonus;
    expect(streakSwitch(render(Panel, stored))).toContain('aria-checked="false"');
    expect(streakSwitch(render(Panel, { ...config, streakBonus: true }))).toContain('aria-checked="true"');
  });

  it('«Racha ×N» solo desde el segundo acierto seguido, y el desglose suma la racha si la hubo', () => {
    expect(guessStreakLabel(undefined)).toBeNull();
    expect(guessStreakLabel(1)).toBeNull();
    expect(guessStreakLabel(3)).toBe('Racha ×3');
    expect(renderToStaticMarkup(<GuessStreakChip streak={1} />)).toBe('');
    expect(renderToStaticMarkup(<GuessStreakChip streak={4} />)).toContain('Racha ×4');
    expect(speedPodiumSolveDetail({ speedPoints: 8, placementBonus: 3 })).toBe('Rapidez 8 + orden 3');
    expect(speedPodiumSolveDetail({ speedPoints: 8, placementBonus: 3, streakBonus: 0 })).toBe('Rapidez 8 + orden 3');
    expect(speedPodiumSolveDetail({ speedPoints: 8, placementBonus: 3, streakBonus: 2 })).toBe('Rapidez 8 + orden 3 + racha 2');
  });
});
