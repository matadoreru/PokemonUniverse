import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { describeBingoCondition } from './rules.js';
import type { BingoCondition } from './types.js';

/**
 * Java describe las condiciones en los mensajes de la partida y la web en las casillas, cada uno con su
 * `describeBingoCondition`. `web-contracts/conditions-cases.json` lo graba `ConditionRulesTest` (aquí solo se lee):
 * cada condición tal como llega por el cable y el texto de Java.
 */
const cases = JSON.parse(readFileSync(new URL('../../../../../backend/src/test/resources/web-contracts/conditions-cases.json', import.meta.url), 'utf8')) as { condition: BingoCondition; description: string }[];

/** Todas las clases de `BingoCondition`: el compilador exige que estén todas y ninguna de más. */
const kinds = {
  GENERATION: true, DEX: true, TYPE: true, TYPE_COMBINATION: true, TYPE_COUNT: true, STAT: true, PHYSICAL: true,
  EVOLUTION: true, LEGENDARY: true, COLOR: true, ABILITY: true,
} satisfies Record<BingoCondition['kind'], true>;

it('hay casos de todas las clases de condición, y solo de ellas', () => {
  expect([...new Set(cases.map(({ condition }) => condition.kind))].sort()).toEqual(Object.keys(kinds).sort());
});

it.each(cases.map(({ condition, description }) => [description, condition] as const))('%s', (description, condition) => {
  expect(describeBingoCondition(condition)).toBe(description);
});
