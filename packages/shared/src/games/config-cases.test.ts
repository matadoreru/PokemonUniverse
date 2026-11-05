import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as contracts from '../public.js';

/**
 * El backend valida las configuraciones con su propio `parse`, y el frontend con los esquemas Zod de este paquete.
 * `config-cases.json` de cada motor (`backend/src/test/resources/golden/<id>/`) graba lo que acepta Java y cómo lo
 * normaliza; el esquema Zod tiene que dar lo mismo.
 */
const golden = new URL('../../../../backend/src/test/resources/golden/', import.meta.url);
const ids = readdirSync(golden, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'catalog').map((entry) => entry.name).sort();

type ConfigCase = { input: unknown; valid: boolean; normalized?: unknown };
const schemaName = (id: string): string => `${id.split('-').map((part, i) => (i === 0 ? part : part[0]!.toUpperCase() + part.slice(1))).join('')}ConfigSchema`;

describe.each(ids)('config-cases de %s', (id) => {
  const cases = JSON.parse(readFileSync(new URL(`${id}/config-cases.json`, golden), 'utf8')) as ConfigCase[];
  const schema = (contracts as Record<string, unknown>)[schemaName(id)] as z.ZodType | undefined;

  it('tiene su esquema en public.ts', () => {
    expect(schema, `falta ${schemaName(id)}`).toBeDefined();
  });

  it.each(cases.map((configCase, index) => [index, configCase] as const))('caso %i', (_index, configCase) => {
    const parsed = schema!.safeParse(configCase.input);
    expect(parsed.success).toBe(configCase.valid);
    if (configCase.valid && parsed.success) expect(parsed.data).toEqual(configCase.normalized);
  });
});
