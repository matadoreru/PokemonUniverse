import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LAST_NATIONAL_DEX_NUMBER = 1_025;
const GENERATION_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1_025] as const;
const BATCH_SIZE = 25;

interface PokeApiPokemon {
  id: number;
  name: string;
  stats: Array<{ base_stat: number; stat: { name: string } }>;
  types: Array<{ slot: number; type: { name: string } }>;
}

function generationFor(number: number): number {
  const index = GENERATION_ENDS.findIndex((end) => number <= end);
  if (index < 0) throw new Error(`No generation for National Dex #${number}`);
  return index + 1;
}

function displayName(value: string): string {
  return value.split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

async function fetchPokemon(number: number): Promise<PokeApiPokemon> {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${number}`);
  if (!response.ok) throw new Error(`PokéAPI returned ${response.status} for Pokémon ${number}`);
  return response.json() as Promise<PokeApiPokemon>;
}

async function main(): Promise<void> {
  const enrichedCount = await prisma.pokemon.count({ where: { hp: { gt: 0 }, types: { isEmpty: false } } });
  if (enrichedCount >= LAST_NATIONAL_DEX_NUMBER && process.env.POKEMON_SYNC !== 'true') {
    console.info(`Catalog already contains ${enrichedCount} enriched Pokémon.`);
    return;
  }

  const entries = [];
  for (let start = 1; start <= LAST_NATIONAL_DEX_NUMBER; start += BATCH_SIZE) {
    const numbers = Array.from({ length: Math.min(BATCH_SIZE, LAST_NATIONAL_DEX_NUMBER - start + 1) }, (_, index) => start + index);
    const batch = await Promise.all(numbers.map(fetchPokemon));
    for (const pokemon of batch) {
      const stats = Object.fromEntries(pokemon.stats.map((entry) => [entry.stat.name, entry.base_stat]));
      const hp = stats.hp ?? 0;
      const attack = stats.attack ?? 0;
      const defense = stats.defense ?? 0;
      const specialAttack = stats['special-attack'] ?? 0;
      const specialDefense = stats['special-defense'] ?? 0;
      const speed = stats.speed ?? 0;
      entries.push({
        id: pokemon.name, nationalDexNumber: pokemon.id, name: displayName(pokemon.name), generation: generationFor(pokemon.id),
        sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`,
        names: { en: pokemon.name }, types: pokemon.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name),
        hp, attack, defense, specialAttack, specialDefense, speed,
        baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
      });
    }
    console.info(`Loaded Pokémon battle data ${start}-${numbers.at(-1)}`);
  }

  if (entries.length !== LAST_NATIONAL_DEX_NUMBER) throw new Error(`Expected ${LAST_NATIONAL_DEX_NUMBER} Pokémon, received ${entries.length}`);
  for (let start = 0; start < entries.length; start += 100) {
    const batch = entries.slice(start, start + 100);
    await prisma.$transaction(batch.map((entry) => prisma.pokemon.upsert({ where: { id: entry.id }, create: entry, update: entry })));
  }
  console.info(`Seeded ${entries.length} enriched Pokémon.`);
}

main().finally(() => prisma.$disconnect());
