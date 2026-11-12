import { readFileSync } from 'node:fs';
import * as contracts from '@pokemon-universe/shared/public';
import { validateGameConfigReadiness } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { clientGameRegistry } from '../registry';
import { applyPace, PACE_IDS, PACE_PRESETS, paceOf, pacePresetsOf } from './pace-presets';

const registry = JSON.parse(readFileSync(new URL('../../../../backend/src/main/resources/games/registry.json', import.meta.url), 'utf8')) as Array<{ id: string; defaultConfig: Record<string, unknown> }>;
const pascal = (id: string) => id.split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join('');
const schemaOf = (id: string) => (contracts as Record<string, unknown>)[`${pascal(id)[0]!.toLowerCase()}${pascal(id).slice(1)}ConfigSchema`] as z.ZodType;
const withPresets = registry.filter((game) => pacePresetsOf(game.id));
/** Readiness con una sala que no limita: los ritmos no dependen de cuántos jugadores haya. */
const context = { playerCount: 8, hostCustomCategoryCount: 10, hostWouldYouRatherPromptCount: 10 };

describe('ritmos de los juegos', () => {
  it('hay una fila por cada juego del registro (null si no tiene ritmos), y ninguna de más', () => {
    expect(Object.keys(PACE_PRESETS).sort()).toEqual(registry.map((game) => game.id).sort());
    expect(Object.keys(PACE_PRESETS).sort()).toEqual(clientGameRegistry.list().map((game) => game.id).sort());
  });

  it('solo Type Chain se queda sin ritmos', () => {
    expect(registry.filter((game) => !pacePresetsOf(game.id)).map((game) => game.id)).toEqual(['type-chain']);
  });

  it.each(withPresets.map((game) => [game.id, game.defaultConfig] as const))('%s: Clásico es el defaultConfig', (id, defaultConfig) => {
    expect(paceOf(id, defaultConfig)).toBe('CLASSIC');
    expect(applyPace(id, defaultConfig, 'CLASSIC')).toEqual(defaultConfig);
  });

  it.each(withPresets.map((game) => [game.id, game.defaultConfig] as const))('%s: cada ritmo pasa su esquema y la preparación', (id, defaultConfig) => {
    for (const pace of PACE_IDS) {
      const config = applyPace(id, defaultConfig, pace);
      const parsed = schemaOf(id).safeParse(config);
      expect(parsed.success, `${pace}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      // El esquema no normaliza nada del ritmo: lo que se envía es lo que se guarda.
      expect(parsed.data).toEqual(config);
      expect(validateGameConfigReadiness(id, config, context), pace).toBeNull();
      expect(paceOf(id, config)).toBe(pace);
    }
  });

  it.each(withPresets.map((game) => [game.id] as const))('%s: los tres ritmos son distintos, con las mismas claves y sin tocar el modo', (id) => {
    const table = pacePresetsOf(id)!;
    expect(table.keys).not.toContain('mode');
    for (const pace of PACE_IDS) expect(Object.keys(table.presets[pace]).sort()).toEqual([...table.keys].sort());
    const signatures = PACE_IDS.map((pace) => JSON.stringify(table.keys.map((key) => table.presets[pace][key])));
    expect(new Set(signatures).size).toBe(3);
  });

  it('un ajuste cubierto cambiado a mano es «Personalizado»; uno no cubierto no cambia el ritmo', () => {
    const fast = applyPace('who-is-who-pokemon', contracts.defaultWhoIsWhoPokemonConfig, 'FAST') as Record<string, unknown>;
    expect(paceOf('who-is-who-pokemon', fast)).toBe('FAST');
    expect(paceOf('who-is-who-pokemon', { ...fast, rounds: 5 })).toBeNull();
    expect(paceOf('who-is-who-pokemon', { ...fast, boardSize: 30, generations: [1] })).toBe('FAST');
  });

  it('aplicar un ritmo conserva el resto de la configuración', () => {
    const config = { ...contracts.defaultOneOfUsIsFakeConfig, generations: [1, 2], fakeKnows: true, categorySource: 'BOTH' };
    expect(applyPace('one-of-us-is-fake', config, 'EXPERT')).toEqual({ ...config, rounds: 8, selectionSeconds: 20, discussionSeconds: 90 });
  });

  it('una configuración parcial o vacía es «Personalizado» sin romper', () => {
    expect(paceOf('shiny-vote', {})).toBeNull();
    expect(paceOf('shiny-vote', { generations: [1, 2, 3], rounds: 5, roundSeconds: 20 })).toBeNull();
    expect(paceOf('shiny-vote', null)).toBeNull();
    expect(paceOf('type-chain', contracts.defaultTypeChainConfig)).toBeNull();
    expect(applyPace('type-chain', contracts.defaultTypeChainConfig, 'FAST')).toBe(contracts.defaultTypeChainConfig);
  });
});
