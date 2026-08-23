import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LAST_NATIONAL_DEX_NUMBER = 1_025;
const GENERATION_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1_025] as const;
const BATCH_SIZE = 25;
const MIN_REGIONAL_FORM_COUNT = 50;

interface PokeApiPokemon {
  id: number;
  name: string;
  species: { name: string; url: string };
  sprites: { front_default: string | null };
  stats: Array<{ base_stat: number; stat: { name: string } }>;
  types: Array<{ slot: number; type: { name: string } }>;
}

interface PokeApiPokemonList { results: Array<{ name: string }> }

function generationFor(number: number): number {
  const index = GENERATION_ENDS.findIndex((end) => number <= end);
  if (index < 0) throw new Error(`No generation for National Dex #${number}`);
  return index + 1;
}

function displayName(value: string): string {
  return value.split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

async function fetchPokemon(identifier: number | string): Promise<PokeApiPokemon> {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${identifier}`);
  if (!response.ok) throw new Error(`PokéAPI returned ${response.status} for Pokémon ${identifier}`);
  return response.json() as Promise<PokeApiPokemon>;
}

function regionalFormName(name: string): boolean {
  return /-(alola|galar|hisui|paldea)$/.test(name) || /^tauros-paldea-(combat|blaze|aqua)-breed$/.test(name);
}

async function fetchRegionalFormNames(): Promise<string[]> {
  const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=100000');
  if (!response.ok) throw new Error(`PokéAPI returned ${response.status} while listing Pokémon forms`);
  const body = await response.json() as PokeApiPokemonList;
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

function toEntry(pokemon: PokeApiPokemon, isDefault: boolean) {
  const nationalDexNumber = nationalDexNumberFor(pokemon);
  const stats = Object.fromEntries(pokemon.stats.map((entry) => [entry.stat.name, entry.base_stat]));
  const hp = stats.hp ?? 0;
  const attack = stats.attack ?? 0;
  const defense = stats.defense ?? 0;
  const specialAttack = stats['special-attack'] ?? 0;
  const specialDefense = stats['special-defense'] ?? 0;
  const speed = stats.speed ?? 0;
  return {
    id: pokemon.name, nationalDexNumber, name: isDefault ? displayName(pokemon.species.name) : regionalDisplayName(pokemon), generation: generationFor(nationalDexNumber), isDefault,
    sprite: pokemon.sprites.front_default ?? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`,
    names: { en: pokemon.name }, types: pokemon.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name),
    hp, attack, defense, specialAttack, specialDefense, speed,
    baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
  };
}

async function main(): Promise<void> {
  const [enrichedDefaultCount, regionalFormCount] = await Promise.all([
    prisma.pokemon.count({ where: { isDefault: true, hp: { gt: 0 }, types: { isEmpty: false } } }),
    prisma.pokemon.count({ where: { isDefault: false } }),
  ]);
  if (enrichedDefaultCount >= LAST_NATIONAL_DEX_NUMBER && regionalFormCount >= MIN_REGIONAL_FORM_COUNT && process.env.POKEMON_SYNC !== 'true') {
    console.info(`Catalog already contains ${enrichedDefaultCount} base Pokémon and ${regionalFormCount} regional forms.`);
    return;
  }

  const entries = [];
  const syncBasePokemon = enrichedDefaultCount < LAST_NATIONAL_DEX_NUMBER || process.env.POKEMON_SYNC === 'true';
  if (syncBasePokemon) {
    for (let start = 1; start <= LAST_NATIONAL_DEX_NUMBER; start += BATCH_SIZE) {
      const numbers = Array.from({ length: Math.min(BATCH_SIZE, LAST_NATIONAL_DEX_NUMBER - start + 1) }, (_, index) => start + index);
      const batch = await Promise.all(numbers.map(fetchPokemon));
      entries.push(...batch.map((pokemon) => toEntry(pokemon, true)));
      console.info(`Loaded Pokémon battle data ${start}-${numbers.at(-1)}`);
    }
    if (entries.length !== LAST_NATIONAL_DEX_NUMBER) throw new Error(`Expected ${LAST_NATIONAL_DEX_NUMBER} base Pokémon, received ${entries.length}`);
  } else {
    console.info(`Keeping ${enrichedDefaultCount} existing base Pokémon; only regional forms need synchronization.`);
  }

  const regionalFormNames = await fetchRegionalFormNames();
  if (regionalFormNames.length < MIN_REGIONAL_FORM_COUNT) throw new Error(`Expected at least ${MIN_REGIONAL_FORM_COUNT} regional forms, received ${regionalFormNames.length}`);
  for (let start = 0; start < regionalFormNames.length; start += BATCH_SIZE) {
    const names = regionalFormNames.slice(start, start + BATCH_SIZE);
    const batch = await Promise.all(names.map(fetchPokemon));
    entries.push(...batch.map((pokemon) => toEntry(pokemon, false)));
  }
  console.info(`Loaded ${regionalFormNames.length} regional forms.`);

  for (let start = 0; start < entries.length; start += 100) {
    const batch = entries.slice(start, start + 100);
    await prisma.$transaction(batch.map((entry) => (
      prisma.pokemon.upsert({
        where: { id: entry.id },
        create: entry,
        update: entry,
      })
    )));
  }
  console.info(`Seeded ${entries.length} enriched Pokémon and forms.`);
}

main().finally(() => prisma.$disconnect());
