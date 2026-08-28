import { isSupportedRegionalFormId, type Generation, type LearnsetPokemonCatalog, type Move, type MoveCategory, type PokedexEntry, type PokedexEntryPokemonCatalog, type Pokemon, type PokemonEvolutionInfo, type PokemonLegendaryStatus, type PokemonType, type ResolvedLevelUpMove } from '@pokemon-universe/shared';
import { prisma } from '../db.js';

interface CatalogLearnsetEntry { pokemonId: string; moveId: string; referenceGeneration: number; level: number }

export class InMemoryPokemonCatalog implements LearnsetPokemonCatalog, PokedexEntryPokemonCatalog {
  private readonly entries: readonly Pokemon[];
  private readonly idIndex: Map<string, Pokemon>;
  private readonly dexIndex: Map<number, Pokemon>;
  private readonly moveIndex: Map<string, Move>;
  private readonly learnsetIndex = new Map<string, ResolvedLevelUpMove[]>();
  private readonly evolutionIndex: Map<string, PokemonEvolutionInfo>;
  private readonly pokedexEntryIndex = new Map<string, PokedexEntry[]>();
  constructor(
    entries: readonly Pokemon[],
    moves: readonly Move[] = [],
    learnsets: readonly CatalogLearnsetEntry[] = [],
    evolution: Readonly<Record<string, PokemonEvolutionInfo>> = {},
    pokedexEntries: readonly PokedexEntry[] = [],
  ) {
    const defaultDexNumbers = new Set<number>();
    this.entries = entries.filter((pokemon) => {
      if (pokemon.isDefault === false) return isSupportedRegionalFormId(pokemon.id);
      if (defaultDexNumbers.has(pokemon.nationalDexNumber)) return false;
      defaultDexNumbers.add(pokemon.nationalDexNumber);
      return true;
    });
    this.idIndex = new Map(this.entries.map((pokemon) => [pokemon.id, pokemon]));
    this.dexIndex = new Map(this.entries.filter((pokemon) => pokemon.isDefault !== false).map((pokemon) => [pokemon.nationalDexNumber, pokemon]));
    this.moveIndex = new Map(moves.map((move) => [move.id, move]));
    this.evolutionIndex = new Map(Object.entries(evolution));
    for (const entry of learnsets) {
      const move = this.moveIndex.get(entry.moveId); if (!move) continue;
      const key = `${entry.pokemonId}:${entry.referenceGeneration}`;
      const list = this.learnsetIndex.get(key) ?? [];
      list.push({ moveId: entry.moveId, level: entry.level, move }); this.learnsetIndex.set(key, list);
    }
    for (const list of this.learnsetIndex.values()) list.sort((a, b) => a.level - b.level || a.move.name.localeCompare(b.move.name));
    for (const entry of pokedexEntries) this.pokedexEntryIndex.set(entry.pokemonId, [...(this.pokedexEntryIndex.get(entry.pokemonId) ?? []), entry]);
    for (const list of this.pokedexEntryIndex.values()) list.sort((a, b) => b.generation - a.generation || a.version.localeCompare(b.version));
  }
  all(): readonly Pokemon[] { return this.entries; }
  byId(id: string): Pokemon | undefined { return this.idIndex.get(id); }
  byDexNumber(number: number): Pokemon | undefined { return this.dexIndex.get(number); }
  forGenerations(generations: readonly number[], options: { includeForms?: boolean } = {}): readonly Pokemon[] {
    const allowed = new Set(generations);
    return this.entries.filter((pokemon) => allowed.has(pokemon.generation) && (options.includeForms || pokemon.isDefault !== false));
  }
  levelUpMoves(pokemonId: string, referenceGeneration: Generation): readonly ResolvedLevelUpMove[] {
    return this.learnsetIndex.get(`${pokemonId}:${referenceGeneration}`) ?? [];
  }
  evolutionInfo(pokemonId: string): PokemonEvolutionInfo | undefined { return this.evolutionIndex.get(pokemonId); }
  pokedexEntries(pokemonId: string): readonly PokedexEntry[] { return this.pokedexEntryIndex.get(pokemonId) ?? []; }
}

export async function loadPokemonCatalog(): Promise<InMemoryPokemonCatalog> {
  const [rows, moveRows, learnsetRows, pokedexEntryRows] = await Promise.all([
    prisma.pokemon.findMany({ orderBy: [{ nationalDexNumber: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }] }),
    prisma.move.findMany(),
    prisma.pokemonLevelUpMove.findMany({ orderBy: [{ pokemonId: 'asc' }, { referenceGeneration: 'asc' }, { level: 'asc' }] }),
    prisma.pokedexEntry.findMany({ orderBy: [{ pokemonId: 'asc' }, { generation: 'desc' }, { version: 'asc' }] }),
  ]);
  if (rows.length === 0) throw new Error('Pokémon catalog is empty. Run `npm run db:seed`.');
  const pokemon = rows.map((row) => ({
    id: row.id, nationalDexNumber: row.nationalDexNumber, name: row.name,
    generation: row.generation, isDefault: row.isDefault, sprite: row.sprite,
    ...(row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) && typeof row.metadata.shinySprite === 'string' ? { shinySprite: row.metadata.shinySprite } : {}),
    hp: row.hp, attack: row.attack, defense: row.defense, specialAttack: row.specialAttack,
    specialDefense: row.specialDefense, speed: row.speed, baseStatTotal: row.baseStatTotal,
    heightDecimeters: row.heightDecimeters, weightHectograms: row.weightHectograms,
    ...(row.evolutionStage ? { evolutionStage: row.evolutionStage } : {}),
    ...(row.evolutionStages ? { evolutionStageCount: row.evolutionStages } : {}),
    legendaryStatus: row.legendaryStatus as PokemonLegendaryStatus, color: row.color, abilities: row.abilities,
    ...(row.names && typeof row.names === 'object' ? { names: row.names as Record<string, string> } : {}),
    types: row.types as PokemonType[],
  }));
  const moves: Move[] = moveRows.map((move) => ({
    id: move.id, name: move.name, type: move.type as PokemonType, category: move.category as MoveCategory,
    ...(move.names && typeof move.names === 'object' ? { names: move.names as Record<string, string> } : {}),
  }));
  const evolution = Object.fromEntries(rows.flatMap((row) => row.evolutionStage && row.evolutionStages
    ? [[row.id, { stage: row.evolutionStage, stages: row.evolutionStages }]] : []));
  const pokedexEntries: PokedexEntry[] = pokedexEntryRows.map((entry) => ({
    pokemonId: entry.pokemonId, text: entry.text, language: 'es', generation: entry.generation as Generation,
    version: entry.version, versionLabel: entry.versionLabel,
  }));
  return new InMemoryPokemonCatalog(pokemon, moves, learnsetRows, evolution, pokedexEntries);
}
