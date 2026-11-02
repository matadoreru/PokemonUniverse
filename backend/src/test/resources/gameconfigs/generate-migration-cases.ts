// Genera migration-cases.json con el migrateStoredGameConfig de Node (oráculo de StoredGameConfigMigrationTest).
// Uso, desde la raíz del repositorio (con packages/shared compilado):
//   cd apps/server && npx tsx -e "$(cat ../../backend/src/test/resources/gameconfigs/generate-migration-cases.ts)"
import { gameRegistry } from '@pokemon-universe/shared';
import { migrateStoredGameConfig } from './src/game-configs/service.ts';
import { writeFileSync } from 'node:fs';

type Case = { name: string; gameId: string; stored: unknown; expected?: unknown };
const cases: Case[] = [];
const def = (id: string) => structuredClone(gameRegistry.get(id)!.defaultConfig) as Record<string, any>;
const add = (name: string, gameId: string, stored: unknown) => cases.push({ name, gameId, stored });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Casos del brief (higher-lower y pokemon-bingo).
add('higher-lower: clave obsoleta eliminada', 'higher-lower', { ...def('higher-lower'), legacyMode: 'CLASSIC', rounds: 7 });
add('higher-lower: tipo erróneo sustituido por el defecto', 'higher-lower', { ...def('higher-lower'), rounds: 'diez', roundSeconds: 30 });
add('higher-lower: array con un elemento inválido sustituido entero', 'higher-lower', { ...def('higher-lower'), categories: ['HP', 'NOT_A_CATEGORY'], rounds: 5 });
add('higher-lower: JSON no objeto', 'higher-lower', 'texto');
add('higher-lower: configuración válida sin cambios', 'higher-lower', { ...def('higher-lower'), generations: [1, 2], categories: ['HP', 'SPEED'], showPreviousValue: false, answerVisibility: 'REVEAL', difficulty: 'HARD', roundSeconds: 15, rounds: 3 });
add('higher-lower: varias claves erróneas a la vez', 'higher-lower', { ...def('higher-lower'), generations: 'x', categories: 7, rounds: 999, difficulty: 'HARD' });
add('higher-lower: transformación al validar', 'higher-lower', { ...def('higher-lower'), generations: [3, 1, 1] });
add('pokemon-bingo: clave obsoleta eliminada', 'pokemon-bingo', { ...def('pokemon-bingo'), legacy: true, width: 4 });
add('pokemon-bingo: tipo erróneo sustituido por el defecto', 'pokemon-bingo', { ...def('pokemon-bingo'), durationSeconds: '120', width: 5 });
add('pokemon-bingo: generations con un elemento inválido', 'pokemon-bingo', { ...def('pokemon-bingo'), generations: [1, 12], height: 4 });
add('pokemon-bingo: JSON no objeto (array)', 'pokemon-bingo', [1, 2, 3]);
add('pokemon-bingo: JSON null', 'pokemon-bingo', null);
add('pokemon-bingo: configuración válida sin cambios', 'pokemon-bingo', { ...def('pokemon-bingo'), width: 4, height: 5, maxConditionsPerCell: 2, families: { ...def('pokemon-bingo').families, color: true, hp: false } });
add('pokemon-bingo: familia con tipo erróneo y otra cambiada', 'pokemon-bingo', { ...def('pokemon-bingo'), families: { ...def('pokemon-bingo').families, color: 'sí', hp: false, retired: true } });
add('pokemon-bingo: families no objeto', 'pokemon-bingo', { ...def('pokemon-bingo'), families: 'todas', width: 6 });
add('pokemon-bingo: todas las familias erróneas', 'pokemon-bingo', { ...def('pokemon-bingo'), families: Object.fromEntries(Object.keys(def('pokemon-bingo').families).map((k) => [k, 1])) });
add('pokemon-bingo: maxConditionsPerCell fuera de la unión', 'pokemon-bingo', { ...def('pokemon-bingo'), maxConditionsPerCell: 3, width: 2 });
// Refinamientos entre campos.
add('guess-from-stats: stat errónea con solo otra activa', 'guess-from-stats', { ...def('guess-from-stats'), stats: { hp: 'x', attack: true, defense: false, specialAttack: false, specialDefense: false, speed: false, bst: false } });
add('guess-from-stats: menos de dos estadísticas', 'guess-from-stats', { ...def('guess-from-stats'), stats: { hp: true, attack: false, defense: false, specialAttack: false, specialDefense: false, speed: false, bst: false }, rounds: 4 });
add('guess-from-stats: pistas activas sin ninguna', 'guess-from-stats', { ...def('guess-from-stats'), hintsEnabled: true, hints: Object.fromEntries(Object.keys(def('guess-from-stats').hints).map((k) => [k, false])) });
add('pokedex-entry-guess: pistas activas sin ninguna', 'pokedex-entry-guess', { ...def('pokedex-entry-guess'), hintsEnabled: true, hints: Object.fromEntries(Object.keys(def('pokedex-entry-guess').hints).map((k) => [k, false])), rounds: 3 });
add('pokemon-trivia: generación con un tipo inválido', 'pokemon-trivia', { ...def('pokemon-trivia'), generations: [1], questionTypes: ['GENERATION', 'BAD'] });
add('pokemon-trivia: solo generación con una generación', 'pokemon-trivia', { ...def('pokemon-trivia'), generations: [1], questionTypes: ['GENERATION'] });
add('tcg-higher-lower: máximo menor que mínimo y rondas fuera de rango', 'tcg-higher-lower', { ...def('tcg-higher-lower'), minPrice: '5', maxPrice: '1', rounds: 999 });
add('tcg-higher-lower: precio inválido', 'tcg-higher-lower', { ...def('tcg-higher-lower'), minPrice: 'abc', setIds: ['base1', ''] });
add('pokemon-connections: tablero sin grupos completos', 'pokemon-connections', { ...def('pokemon-connections'), groupSize: 4, pokemonCount: 17 });
add('pokemon-connections: recuento bajo y tablero incompleto', 'pokemon-connections', { ...def('pokemon-connections'), groupSize: 4, pokemonCount: 8, rounds: 2 });
add('poke-taboo: tiempo fuera de la lista', 'poke-taboo', { ...def('poke-taboo'), roundSeconds: 50 });
add('pokeddle-race: pista con tipo erróneo', 'pokeddle-race', { ...def('pokeddle-race'), clues: { ...def('pokeddle-race').clues, types: 1, color: true } });
add('zoomed-pokemon: hintKinds con valor inválido', 'zoomed-pokemon', { ...def('zoomed-pokemon'), hintKinds: ['TYPE', 'BAD'], imageMode: 'BAD', rounds: 4 });

// Barrido genérico de los 28 juegos.
const probes: Array<[string, unknown]> = [['texto', 'x'], ['null', null], ['enorme', 999999], ['negativo', -1], ['decimal', 1.5], ['lista vacía', []], ['objeto', { a: 1 }], ['booleano', true]];
for (const game of gameRegistry.list()) {
  const id = game.manifest.id;
  const base = def(id);
  add(`${id}: defecto`, id, base);
  add(`${id}: número`, id, 42);
  add(`${id}: clave obsoleta`, id, { ...base, retiredKey: 1 });
  for (const [key, value] of Object.entries(base)) {
    for (const [label, probe] of probes) add(`${id}: ${key} ${label}`, id, { ...base, [key]: probe });
    if (Array.isArray(value)) add(`${id}: ${key} con elemento inválido`, id, { ...base, [key]: [...value, 'BAD'] });
    if (isRecord(value)) {
      for (const nested of Object.keys(value)) add(`${id}: ${key}.${nested} texto`, id, { ...base, [key]: { ...value, [nested]: 'x' } });
    }
  }
  add(`${id}: todas las claves erróneas`, id, Object.fromEntries(Object.keys(base).map((k) => [k, 'x'])));
}

for (const entry of cases) entry.expected = migrateStoredGameConfig(gameRegistry.get(entry.gameId)!, entry.stored);
writeFileSync("../../backend/src/test/resources/gameconfigs/migration-cases.json", `[\n${cases.map((c) => JSON.stringify(c)).join(",\n")}\n]\n`);
console.error(`${cases.length} cases`);
