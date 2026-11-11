import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as contracts from '../public.js';

/**
 * `backend/src/main/resources/games/registry.json` es la fuente de los manifiestos y de las configuraciones por
 * defecto que usa el backend. Las `default<Juego>Config` de este paquete, que usan los tests de la web, tienen que
 * coincidir.
 */
const registry = JSON.parse(readFileSync(new URL('../../../../backend/src/main/resources/games/registry.json', import.meta.url), 'utf8')) as Array<{ id: string; defaultConfig: unknown }>;

const exportName = (id: string): string => `default${id.split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join('')}Config`;

describe('configuraciones por defecto del registro', () => {
  it.each(registry.map((game) => [game.id, game.defaultConfig] as const))('%s coincide con registry.json', (id, defaultConfig) => {
    const name = exportName(id);
    expect(contracts, `falta ${name} en public.ts`).toHaveProperty(name);
    expect((contracts as Record<string, unknown>)[name]).toEqual(defaultConfig);
  });
});
