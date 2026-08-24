import { type Generation, type MoveCategory, type PokemonType } from '@pokemon-universe/shared';
import { PrismaClient } from '@prisma/client';
import { extractCanonicalLevelUpEntries } from '../src/pokemon/learnset-source.js';

const prisma = new PrismaClient();
const LAST_NATIONAL_DEX_NUMBER = 1_025;
const GENERATION_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1_025] as const;
const BATCH_SIZE = 25;
const MIN_REGIONAL_FORM_COUNT = 50;
const MIN_LEARNSET_ENTRIES = 5_000;
const MIN_MOVE_COUNT = 500;
const LEARNSET_SYNC_KEY = 'canonical-level-up-learnsets';
const LEARNSET_SYNC_VERSION = 1;
const EVOLUTION_SYNC_KEY = 'evolution-positions';
const EVOLUTION_SYNC_VERSION = 2;
const POKEDDLE_METADATA_SYNC_KEY = 'pokeddle-species-metadata';
const POKEDDLE_METADATA_SYNC_VERSION = 1;

interface PokeApiVersionDetail {
  level_learned_at: number;
  move_learn_method: { name: string };
  version_group: { name: string };
}

interface PokeApiPokemon {
  id: number;
  name: string;
  species: { name: string; url: string };
  sprites: { front_default: string | null };
  stats: Array<{ base_stat: number; stat: { name: string } }>;
  types: Array<{ slot: number; type: { name: string } }>;
  height: number;
  weight: number;
  abilities: Array<{ ability: { name: string }; is_hidden: boolean }>;
  moves: Array<{ move: { name: string; url: string }; version_group_details: PokeApiVersionDetail[] }>;
}

interface PokeApiMove {
  name: string;
  names: Array<{ name: string; language: { name: string } }>;
  type: { name: string };
  damage_class: { name: string };
}

interface PokeApiSpecies {
  name: string;
  evolves_from_species: { name: string } | null;
  is_legendary: boolean;
  is_mythical: boolean;
  color: { name: string };
}

interface PokeApiPokemonList { results: Array<{ name: string }> }

function generationFor(number: number): Generation {
  const index = GENERATION_ENDS.findIndex((end) => number <= end);
  if (index < 0) throw new Error(`No generation for National Dex #${number}`);
  return (index + 1) as Generation;
}

function displayName(value: string): string {
  return value.split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetch(url);
    } catch (error) {
      lastError = error;
    }
    if (response?.ok) return response.json() as Promise<T>;
    if (response) {
      lastError = new Error(`PokéAPI returned ${response.status} for ${label}`);
      if (response.status < 500 && response.status !== 429) throw lastError;
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not load ${label} from PokéAPI`);
}

function fetchPokemon(identifier: number | string): Promise<PokeApiPokemon> {
  return fetchJson(`https://pokeapi.co/api/v2/pokemon/${identifier}`, `Pokémon ${identifier}`);
}

function fetchSpecies(identifier: number): Promise<PokeApiSpecies> {
  return fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${identifier}`, `species ${identifier}`);
}

function fetchMove(url: string, name: string): Promise<PokeApiMove> { return fetchJson(url, `move ${name}`); }

function regionalFormName(name: string): boolean {
  return /-(alola|galar|hisui|paldea)$/.test(name) || /^tauros-paldea-(combat|blaze|aqua)-breed$/.test(name);
}

async function fetchRegionalFormNames(): Promise<string[]> {
  const body = await fetchJson<PokeApiPokemonList>('https://pokeapi.co/api/v2/pokemon?limit=100000', 'Pokémon forms');
  return body.results.map((entry) => entry.name).filter(regionalFormName).sort();
}

function nationalDexNumberFor(pokemon: PokeApiPokemon): number {
  const match = /\/pokemon-species\/(\d+)\/?$/.exec(pokemon.species.url);
  const number = Number(match?.[1]);
  if (!Number.isInteger(number) || number < 1 || number > LAST_NATIONAL_DEX_NUMBER) throw new Error(`Invalid species URL for ${pokemon.name}: ${pokemon.species.url}`);
  return number;
}

function regionalDisplayName(pokemon: PokeApiPokemon): string {
  const region = /-(alola|galar|hisui|paldea)(?:-(.+))?$/.exec(pokemon.name);
  if (!region) return displayName(pokemon.species.name);
  const regionLabels: Record<string, string> = { alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea' };
  const detail = region[2] ? ` (${displayName(region[2])})` : '';
  return `${displayName(pokemon.species.name)} de ${regionLabels[region[1]!]!}${detail}`;
}

function toEntry(pokemon: PokeApiPokemon, isDefault: boolean, species: PokeApiSpecies) {
  const nationalDexNumber = nationalDexNumberFor(pokemon);
  const stats = Object.fromEntries(pokemon.stats.map((entry) => [entry.stat.name, entry.base_stat]));
  const hp = stats.hp ?? 0; const attack = stats.attack ?? 0; const defense = stats.defense ?? 0;
  const specialAttack = stats['special-attack'] ?? 0; const specialDefense = stats['special-defense'] ?? 0; const speed = stats.speed ?? 0;
  return {
    id: pokemon.name, nationalDexNumber, name: isDefault ? displayName(pokemon.species.name) : regionalDisplayName(pokemon), generation: generationFor(nationalDexNumber), isDefault,
    sprite: pokemon.sprites.front_default ?? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`,
    names: { en: pokemon.species.name }, types: pokemon.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name),
    hp, attack, defense, specialAttack, specialDefense, speed, baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
    heightDecimeters: pokemon.height, weightHectograms: pokemon.weight,
    legendaryStatus: species.is_mythical ? 'MYTHICAL' : species.is_legendary ? 'LEGENDARY' : 'NORMAL',
    color: species.color.name,
    abilities: [...new Set(pokemon.abilities.map((entry) => entry.ability.name))].sort(),
  };
}

async function fetchPokemonRange(): Promise<PokeApiPokemon[]> {
  const result: PokeApiPokemon[] = [];
  for (let start = 1; start <= LAST_NATIONAL_DEX_NUMBER; start += BATCH_SIZE) {
    const numbers = Array.from({ length: Math.min(BATCH_SIZE, LAST_NATIONAL_DEX_NUMBER - start + 1) }, (_, index) => start + index);
    result.push(...await Promise.all(numbers.map(fetchPokemon)));
    console.info(`Loaded Pokémon data ${start}-${numbers.at(-1)}`);
  }
  return result;
}

async function fetchSpeciesRange(): Promise<PokeApiSpecies[]> {
  const result: PokeApiSpecies[] = [];
  for (let start = 1; start <= LAST_NATIONAL_DEX_NUMBER; start += BATCH_SIZE) {
    const numbers = Array.from({ length: Math.min(BATCH_SIZE, LAST_NATIONAL_DEX_NUMBER - start + 1) }, (_, index) => start + index);
    result.push(...await Promise.all(numbers.map(fetchSpecies)));
    console.info(`Loaded species metadata ${start}-${numbers.at(-1)}`);
  }
  return result;
}

async function syncLearnsets(pokemon: PokeApiPokemon[]): Promise<void> {
  const entries = pokemon.flatMap((entry) => extractCanonicalLevelUpEntries(entry.name, generationFor(nationalDexNumberFor(entry)), entry.moves));
  const moveUrls = new Map<string, string>();
  for (const item of pokemon) for (const move of item.moves) moveUrls.set(move.move.name, move.move.url);
  const moveNames = [...new Set(entries.map((entry) => entry.moveId))]; const moves: PokeApiMove[] = [];
  for (let start = 0; start < moveNames.length; start += BATCH_SIZE) {
    const names = moveNames.slice(start, start + BATCH_SIZE);
    moves.push(...await Promise.all(names.map((name) => fetchMove(moveUrls.get(name)!, name))));
    console.info(`Loaded move metadata ${start + 1}-${Math.min(start + BATCH_SIZE, moveNames.length)} / ${moveNames.length}`);
  }
  for (let start = 0; start < moves.length; start += 100) {
    await prisma.$transaction(moves.slice(start, start + 100).map((move) => {
      const data = {
        name: move.names.find((entry) => entry.language.name === 'en')?.name ?? displayName(move.name),
        type: move.type.name as PokemonType, category: move.damage_class.name as MoveCategory,
        names: Object.fromEntries(move.names.filter((entry) => ['en', 'es'].includes(entry.language.name)).map((entry) => [entry.language.name, entry.name])),
      };
      return prisma.move.upsert({ where: { id: move.name }, create: { id: move.name, ...data }, update: data });
    }));
  }
  await prisma.pokemonLevelUpMove.deleteMany({ where: { pokemonId: { in: pokemon.map((entry) => entry.name) } } });
  for (let start = 0; start < entries.length; start += 1_000) await prisma.pokemonLevelUpMove.createMany({ data: entries.slice(start, start + 1_000), skipDuplicates: true });
  console.info(`Seeded ${entries.length} canonical level-up entries across ${moves.length} moves.`);
}

async function syncEvolution(defaultPokemon: PokeApiPokemon[], species: PokeApiSpecies[]): Promise<void> {
  const parent = new Map(species.map((entry) => [entry.name, entry.evolves_from_species?.name ?? null]));
  const children = new Map<string, string[]>();
  for (const entry of species) if (entry.evolves_from_species) children.set(entry.evolves_from_species.name, [...(children.get(entry.evolves_from_species.name) ?? []), entry.name]);
  const stageMemo = new Map<string, number>(); const depthMemo = new Map<string, number>();
  const stage = (name: string): number => { const cached = stageMemo.get(name); if (cached) return cached; const value = parent.get(name) ? stage(parent.get(name)!) + 1 : 1; stageMemo.set(name, value); return value; };
  const depth = (name: string): number => { const cached = depthMemo.get(name); if (cached) return cached; const value = 1 + Math.max(0, ...(children.get(name) ?? []).map(depth)); depthMemo.set(name, value); return value; };
  const root = (name: string): string => { let current = name; while (parent.get(current)) current = parent.get(current)!; return current; };
  const pokemonIdBySpecies = new Map(defaultPokemon.map((entry) => [entry.species.name, entry.name]));
  const updates = species.flatMap((entry) => {
    const pokemonId = pokemonIdBySpecies.get(entry.name); if (!pokemonId) return [];
    const stages = depth(root(entry.name));
    // A terminal member of a short branch is still normalized as "final" even
    // when another branch in the same family contains an extra intermediate.
    const normalizedStage = (children.get(entry.name)?.length ?? 0) === 0 ? stages : stage(entry.name);
    return prisma.pokemon.update({ where: { id: pokemonId }, data: { evolutionStage: normalizedStage, evolutionStages: stages } });
  });
  for (let start = 0; start < updates.length; start += 100) await prisma.$transaction(updates.slice(start, start + 100));
  console.info(`Seeded evolution position for ${updates.length} Pokémon.`);
}

async function upsertPokemon(entries: ReturnType<typeof toEntry>[]): Promise<void> {
  for (let start = 0; start < entries.length; start += 100) {
    await prisma.$transaction(entries.slice(start, start + 100).map((entry) => prisma.pokemon.upsert({ where: { id: entry.id }, create: entry, update: entry })));
  }
}

async function main(): Promise<void> {
  const force = process.env.POKEMON_SYNC === 'true';
  const [enrichedDefaultCount, regionalFormCount, moveCount, learnsetCount, evolutionCount, metadataCount, syncRows] = await Promise.all([
    prisma.pokemon.count({ where: { isDefault: true, hp: { gt: 0 }, types: { isEmpty: false } } }),
    prisma.pokemon.count({ where: { isDefault: false } }), prisma.move.count(), prisma.pokemonLevelUpMove.count(),
    prisma.pokemon.count({ where: { isDefault: true, evolutionStage: { not: null }, evolutionStages: { not: null } } }),
    prisma.pokemon.count({ where: { isDefault: true, heightDecimeters: { gt: 0 }, weightHectograms: { gt: 0 }, color: { not: 'unknown' }, abilities: { isEmpty: false } } }),
    prisma.pokemonCatalogSync.findMany({ where: { key: { in: [LEARNSET_SYNC_KEY, EVOLUTION_SYNC_KEY, POKEDDLE_METADATA_SYNC_KEY] } } }),
  ]);
  const syncVersions = new Map(syncRows.map((entry) => [entry.key, entry.version]));
  const needsBase = force || enrichedDefaultCount < LAST_NATIONAL_DEX_NUMBER;
  const needsRegional = force || regionalFormCount < MIN_REGIONAL_FORM_COUNT;
  const needsLearnsets = force || (syncVersions.get(LEARNSET_SYNC_KEY) ?? 0) < LEARNSET_SYNC_VERSION || moveCount < MIN_MOVE_COUNT || learnsetCount < MIN_LEARNSET_ENTRIES;
  const needsEvolution = force || (syncVersions.get(EVOLUTION_SYNC_KEY) ?? 0) < EVOLUTION_SYNC_VERSION || evolutionCount < LAST_NATIONAL_DEX_NUMBER;
  const needsMetadata = force || (syncVersions.get(POKEDDLE_METADATA_SYNC_KEY) ?? 0) < POKEDDLE_METADATA_SYNC_VERSION || metadataCount < LAST_NATIONAL_DEX_NUMBER;
  if (!needsBase && !needsRegional && !needsLearnsets && !needsEvolution && !needsMetadata) {
    console.info(`Catalog ready: ${enrichedDefaultCount} Pokémon, ${regionalFormCount} forms, ${moveCount} moves and ${learnsetCount} learnset entries.`); return;
  }

  const defaultPokemon = needsBase || needsLearnsets || needsEvolution || needsMetadata ? await fetchPokemonRange() : [];
  const species = needsBase || needsRegional || needsEvolution || needsMetadata ? await fetchSpeciesRange() : [];
  const speciesByName = new Map(species.map((entry) => [entry.name, entry]));
  if (needsBase || needsMetadata) await upsertPokemon(defaultPokemon.map((pokemon) => toEntry(pokemon, true, speciesByName.get(pokemon.species.name)!)));
  if (needsRegional) {
    const regionalNames = await fetchRegionalFormNames();
    if (regionalNames.length < MIN_REGIONAL_FORM_COUNT) throw new Error(`Expected at least ${MIN_REGIONAL_FORM_COUNT} regional forms, received ${regionalNames.length}`);
    const regional: PokeApiPokemon[] = [];
    for (let start = 0; start < regionalNames.length; start += BATCH_SIZE) regional.push(...await Promise.all(regionalNames.slice(start, start + BATCH_SIZE).map(fetchPokemon)));
    await upsertPokemon(regional.map((pokemon) => toEntry(pokemon, false, speciesByName.get(pokemon.species.name)!))); console.info(`Seeded ${regional.length} regional forms.`);
  }
  if (needsLearnsets) {
    await syncLearnsets(defaultPokemon);
    await prisma.pokemonCatalogSync.upsert({ where: { key: LEARNSET_SYNC_KEY }, create: { key: LEARNSET_SYNC_KEY, version: LEARNSET_SYNC_VERSION }, update: { version: LEARNSET_SYNC_VERSION } });
  }
  if (needsEvolution) {
    await syncEvolution(defaultPokemon, species);
    await prisma.pokemonCatalogSync.upsert({ where: { key: EVOLUTION_SYNC_KEY }, create: { key: EVOLUTION_SYNC_KEY, version: EVOLUTION_SYNC_VERSION }, update: { version: EVOLUTION_SYNC_VERSION } });
  }
  if (needsMetadata) await prisma.pokemonCatalogSync.upsert({ where: { key: POKEDDLE_METADATA_SYNC_KEY }, create: { key: POKEDDLE_METADATA_SYNC_KEY, version: POKEDDLE_METADATA_SYNC_VERSION }, update: { version: POKEDDLE_METADATA_SYNC_VERSION } });
}

main().finally(() => prisma.$disconnect());
