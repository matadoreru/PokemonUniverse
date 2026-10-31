// Exporta el catálogo de Pokémon de las generaciones 1 y 2 a
// backend/src/test/resources/golden/catalog/gen1-2.json con el mismo cargador que producción.
// Requiere DATABASE_URL y el dist del servidor: npm run build -w @pokemon-universe/server
// Se ejecuta a mano cuando cambia el catálogo; el resultado se commitea.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const catalogModule = new URL('../apps/server/dist/src/pokemon/catalog.js', import.meta.url);
const dbModule = new URL('../apps/server/dist/src/db.js', import.meta.url);
const fixtureId = 'gen1-2';
const target = fileURLToPath(new URL(`../backend/src/test/resources/golden/catalog/${fixtureId}.json`, import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL: el catálogo se exporta desde la base de datos local.');
  process.exit(1);
}
if (!existsSync(fileURLToPath(catalogModule))) {
  console.error('No existe apps/server/dist. Ejecuta npm run build -w @pokemon-universe/server');
  process.exit(1);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

const { InMemoryPokemonCatalog, loadPokemonCatalog } = await import(catalogModule.href);
const { prisma } = await import(dbModule.href);
try {
  const catalog = await loadPokemonCatalog();
  // Forma pública de /api/pokemon: sin la paleta extraída por DataSync.
  const pokemon = catalog.forGenerations([1, 2], { includeForms: true }).map((entry) => {
    const publicEntry = { ...entry };
    delete publicEntry.palette;
    delete publicEntry.paletteWeights;
    return publicEntry;
  });
  if (new InMemoryPokemonCatalog(pokemon).all().length !== pokemon.length) {
    throw new Error('El catálogo exportado no es estable bajo el filtrado de InMemoryPokemonCatalog.');
  }
  // Datos extra de esos Pokémon por la API pública del catálogo: movimientos por nivel de las generaciones de
  // referencia 1 y 2 (ya ordenados como los reordena el constructor), los movimientos referenciados, la evolución y
  // las entradas de Pokédex.
  const learnsets = [];
  const moves = new Map();
  const evolution = {};
  const pokedexEntries = [];
  for (const entry of pokemon) {
    for (const referenceGeneration of [1, 2]) {
      for (const levelUp of catalog.levelUpMoves(entry.id, referenceGeneration)) {
        learnsets.push({ pokemonId: entry.id, moveId: levelUp.moveId, referenceGeneration, level: levelUp.level });
        moves.set(levelUp.moveId, levelUp.move);
      }
    }
    const info = catalog.evolutionInfo(entry.id);
    if (info) evolution[entry.id] = info;
    pokedexEntries.push(...catalog.pokedexEntries(entry.id));
  }
  const sortedMoves = [...moves.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fixture = { fixtureId, pokemon, moves: sortedMoves, learnsets, evolution, pokedexEntries };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(sortKeys(JSON.parse(JSON.stringify(fixture))), null, 2) + '\n');
  const forms = pokemon.filter((entry) => entry.isDefault === false).length;
  console.log(`Exportados ${pokemon.length} Pokémon (${pokemon.length - forms} por defecto, ${forms} formas regionales), `
    + `${sortedMoves.length} movimientos, ${learnsets.length} movimientos por nivel, ${Object.keys(evolution).length} evoluciones `
    + `y ${pokedexEntries.length} entradas de Pokédex a ${target}`);
} finally {
  await prisma.$disconnect();
}
