import type { Pokemon } from '../../pokemon/types.js';
import type { PokemonBingoConfig } from './config.js';
import { bingoCellKey, bingoConditionFamily, pokemonMatchesBingoCell } from './rules.js';
import type { BingoCell, BingoCondition } from './types.js';

export type BingoDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export interface BingoConditionTemplate { conditions: BingoCondition[]; key: string; candidatePokemonIds: string[]; difficulty: BingoDifficulty }
export interface GeneratedBingoBoard { cells: BingoCell[]; solutionPokemonIds: Record<string, string>; signature: string }

function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...new Set(values)].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))]!;
}
function difficulty(candidateCount: number, poolSize: number): BingoDifficulty { const ratio = candidateCount / poolSize; return ratio >= .25 ? 'EASY' : ratio >= .08 ? 'MEDIUM' : 'HARD'; }
function shuffle<T>(source: readonly T[], random: () => number): T[] {
  const result = [...source]; for (let index = result.length - 1; index > 0; index -= 1) { const swap = Math.min(index, Math.floor(random() * (index + 1))); [result[index], result[swap]] = [result[swap]!, result[index]!]; } return result;
}

export function buildBingoConditionTemplates(pool: readonly Pokemon[], config: PokemonBingoConfig, random: () => number): BingoConditionTemplate[] {
  const templates = new Map<string, BingoConditionTemplate>();
  const add = (conditions: BingoCondition[]) => {
    if (conditions.length > config.maxConditionsPerCell) return;
    if (new Set(conditions.map(bingoConditionFamily)).size !== conditions.length) return;
    const cell = { conditions }; const key = bingoCellKey(cell); if (templates.has(key)) return;
    const candidatePokemonIds = pool.filter((pokemon) => pokemonMatchesBingoCell(pokemon, cell)).map((pokemon) => pokemon.id);
    if (candidatePokemonIds.length < 2) return;
    templates.set(key, { conditions, key, candidatePokemonIds, difficulty: difficulty(candidatePokemonIds.length, pool.length) });
  };

  if (config.families.generation) for (const generation of config.generations) add([{ kind: 'GENERATION', generation }]);
  if (config.families.dexNumber) {
    const values = pool.map((pokemon) => pokemon.nationalDexNumber); const q20 = quantile(values, .2); const q35 = quantile(values, .35); const q50 = quantile(values, .5); const q65 = quantile(values, .65); const q80 = quantile(values, .8);
    for (const value of [q20, q35, q50, q65]) add([{ kind: 'DEX', operator: 'GT', value }]);
    for (const value of [q35, q50, q65, q80]) add([{ kind: 'DEX', operator: 'LT', value }]);
    add([{ kind: 'DEX', operator: 'RANGE', value: q20, max: q50 }]); add([{ kind: 'DEX', operator: 'RANGE', value: q35, max: q65 }]); add([{ kind: 'DEX', operator: 'RANGE', value: q50, max: q80 }]);
  }
  if (config.families.type) for (const type of [...new Set(pool.flatMap((pokemon) => pokemon.types))]) add([{ kind: 'TYPE', pokemonType: type }]);
  if (config.families.typeCombination) {
    const combinations = new Map<string, Pokemon['types']>();
    for (const pokemon of pool) if (pokemon.types.length === 2) combinations.set([...pokemon.types].sort().join('+'), pokemon.types);
    for (const types of combinations.values()) add([{ kind: 'TYPE_COMBINATION', pokemonTypes: [types[0]!, types[1]!] }]);
  }
  if (config.families.typeCount) { add([{ kind: 'TYPE_COUNT', count: 1 }]); add([{ kind: 'TYPE_COUNT', count: 2 }]); }

  const statKeys = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal'] as const;
  for (const stat of statKeys) if (config.families[stat]) {
    const values = pool.map((pokemon) => pokemon[stat]);
    for (const fraction of [.4, .55, .7]) add([{ kind: 'STAT', stat, operator: 'GT', value: quantile(values, fraction) }]);
    for (const fraction of [.3, .45, .6]) add([{ kind: 'STAT', stat, operator: 'LT', value: quantile(values, fraction) }]);
  }
  for (const [family, metric] of [['height', 'heightDecimeters'], ['weight', 'weightHectograms']] as const) if (config.families[family]) {
    const values = pool.map((pokemon) => pokemon[metric] ?? 0);
    for (const fraction of [.4, .6, .75]) add([{ kind: 'PHYSICAL', metric, operator: 'GT', value: quantile(values, fraction) }]);
    for (const fraction of [.25, .4, .6]) add([{ kind: 'PHYSICAL', metric, operator: 'LT', value: quantile(values, fraction) }]);
  }
  if (config.families.evolutionStage) for (const status of ['BASE', 'MIDDLE', 'FINAL', 'NONE'] as const) add([{ kind: 'EVOLUTION', status }]);
  if (config.families.legendaryStatus) for (const status of ['NORMAL', 'LEGENDARY', 'MYTHICAL'] as const) add([{ kind: 'LEGENDARY', status }]);
  if (config.families.color) for (const color of [...new Set(pool.map((pokemon) => pokemon.color).filter((value): value is string => Boolean(value)))]) add([{ kind: 'COLOR', color }]);
  if (config.families.abilities) {
    const counts = new Map<string, number>(); for (const pokemon of pool) for (const ability of pokemon.abilities ?? []) counts.set(ability, (counts.get(ability) ?? 0) + 1);
    for (const [ability] of [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40)) add([{ kind: 'ABILITY', ability }]);
  }

  if (config.maxConditionsPerCell === 2) {
    const singles = shuffle([...templates.values()], random); const target = Math.min(320, Math.max(config.width * config.height * 12, 80));
    outer: for (let left = 0; left < singles.length; left += 1) for (let right = left + 1; right < singles.length; right += 1) {
      const first = singles[left]!; const second = singles[right]!;
      if (bingoConditionFamily(first.conditions[0]!) === bingoConditionFamily(second.conditions[0]!)) continue;
      add([first.conditions[0]!, second.conditions[0]!]);
      if ([...templates.values()].filter((template) => template.conditions.length === 2).length >= target) break outer;
    }
  }
  return [...templates.values()];
}

export function findPerfectBingoMatching(cells: readonly BingoCell[], pool: readonly Pokemon[]): Record<string, string> | null {
  const candidates = new Map(cells.map((cell) => [cell.id, pool.filter((pokemon) => pokemonMatchesBingoCell(pokemon, cell)).map((pokemon) => pokemon.id)]));
  if ([...candidates.values()].some((ids) => ids.length === 0)) return null;
  const pokemonToCell = new Map<string, string>();
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));
  const visit = (cellId: string, seenPokemon: Set<string>): boolean => {
    for (const pokemonId of candidates.get(cellId) ?? []) {
      if (seenPokemon.has(pokemonId)) continue; seenPokemon.add(pokemonId);
      const occupiedBy = pokemonToCell.get(pokemonId);
      if (!occupiedBy || visit(occupiedBy, seenPokemon)) { pokemonToCell.set(pokemonId, cellId); return true; }
    }
    return false;
  };
  const ordered = [...cells].sort((a, b) => candidates.get(a.id)!.length - candidates.get(b.id)!.length);
  for (const cell of ordered) if (!visit(cell.id, new Set())) return null;
  const result: Record<string, string> = {}; for (const [pokemonId, cellId] of pokemonToCell) if (cellById.has(cellId)) result[cellId] = pokemonId;
  return Object.keys(result).length === cells.length ? result : null;
}

export function generateBingoBoard(templates: readonly BingoConditionTemplate[], pool: readonly Pokemon[], width: number, height: number, random: () => number, forbiddenSignatures: ReadonlySet<string> = new Set(), variant = 0): GeneratedBingoBoard {
  const cellCount = width * height;
  if (templates.length < cellCount) throw new Error(`No se puede generar un tablero ${width}×${height}: solo hay ${templates.length} condiciones distintas válidas.`);
  const choose = (options: readonly BingoConditionTemplate[], salt: number) => options[(Math.floor(random() * options.length) + salt) % options.length]!;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const used = new Set<string>(); const cells: BingoCell[] = [];
    for (let index = 0; index < cellCount; index += 1) {
      const tier: BingoDifficulty = index % 7 === 0 ? 'HARD' : index % 3 === 0 ? 'MEDIUM' : 'EASY';
      const wantsCombined = templates.some((template) => template.conditions.length === 2) && index % 3 === 0;
      let options = templates.filter((template) => !used.has(template.key) && template.difficulty === tier && template.conditions.length === (wantsCombined ? 2 : 1));
      if (!options.length) options = templates.filter((template) => !used.has(template.key) && template.conditions.length === (wantsCombined ? 2 : 1));
      if (!options.length) options = templates.filter((template) => !used.has(template.key));
      if (!options.length) break;
      const selected = choose(options, variant + attempt * cellCount + index); used.add(selected.key); cells.push({ id: `cell-${index + 1}`, conditions: selected.conditions });
    }
    if (cells.length !== cellCount) continue;
    const signature = cells.map(bingoCellKey).join('|'); if (forbiddenSignatures.has(signature)) continue;
    const solutionPokemonIds = findPerfectBingoMatching(cells, pool); if (solutionPokemonIds) return { cells, solutionPokemonIds, signature };
  }
  throw new Error(`No se puede generar un tablero ${width}×${height} globalmente resoluble con esta configuración. Activa más generaciones o familias de condiciones.`);
}

