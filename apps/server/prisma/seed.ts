import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LAST_NATIONAL_DEX_NUMBER = 1_025;
const GENERATION_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1_025] as const;

function generationFor(number: number): number {
  const index = GENERATION_ENDS.findIndex((end) => number <= end);
  if (index < 0) throw new Error(`No generation for National Dex #${number}`);
  return index + 1;
}

async function main(): Promise<void> {
  const currentCount = await prisma.pokemon.count();
  if (currentCount >= LAST_NATIONAL_DEX_NUMBER && process.env.POKEMON_SYNC !== 'true') {
    console.info(`Catalog already contains ${currentCount} Pokémon. Set POKEMON_SYNC=true to refresh it.`);
    return;
  }
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species?limit=${LAST_NATIONAL_DEX_NUMBER}`);
  if (!response.ok) throw new Error(`PokéAPI returned ${response.status}`);
  const body = await response.json() as { results: Array<{ name: string; url: string }> };
  const entries = body.results.map((item) => {
    const match = item.url.match(/\/(\d+)\/?$/);
    const nationalDexNumber = Number(match?.[1]);
    return {
      id: item.name,
      nationalDexNumber,
      name: item.name.split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' '),
      generation: generationFor(nationalDexNumber),
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${nationalDexNumber}.png`,
      names: { en: item.name },
      types: [] as string[],
    };
  }).filter((entry) => entry.nationalDexNumber >= 1 && entry.nationalDexNumber <= LAST_NATIONAL_DEX_NUMBER);

  if (entries.length !== LAST_NATIONAL_DEX_NUMBER) throw new Error(`Expected ${LAST_NATIONAL_DEX_NUMBER} species, received ${entries.length}`);
  if (process.env.POKEMON_SYNC === 'true') await prisma.pokemon.deleteMany();
  await prisma.pokemon.createMany({ data: entries, skipDuplicates: true });
  console.info(`Seeded ${entries.length} National Pokédex species.`);
}

main().finally(() => prisma.$disconnect());
