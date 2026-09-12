import type { Pokemon } from '../../pokemon/types.js';
import type { PokemonBingoConfig } from './config.js';
import { bingoCellKey, pokemonMatchesBingoCell } from './rules.js';
import type { BingoCell } from './types.js';

import { buildConditionTemplates, type BingoConditionTemplate, type BingoDifficulty } from '../../pokemon/conditions/generator.js';
export type { BingoDifficulty, BingoConditionTemplate } from '../../pokemon/conditions/generator.js';
export interface GeneratedBingoBoard { cells: BingoCell[]; solutionPokemonIds: Record<string, string>; signature: string }

export function buildBingoConditionTemplates(pool: readonly Pokemon[], config: PokemonBingoConfig, random: () => number): BingoConditionTemplate[] {
  return buildConditionTemplates(pool, { generations: config.generations, families: config.families, maxConditions: config.maxConditionsPerCell, combinationLimit: Math.min(320, Math.max(config.width * config.height * 12, 80)) }, random);
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

