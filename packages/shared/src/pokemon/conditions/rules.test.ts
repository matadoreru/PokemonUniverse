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

it('hay casos de todas las clases de condición', () => {
  expect(new Set(cases.map(({ condition }) => condition.kind)).size).toBe(11);
});

it.each(cases.map(({ condition, description }) => [description, condition] as const))('%s', (description, condition) => {
  expect(describeBingoCondition(condition)).toBe(description);
});
