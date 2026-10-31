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
  const fixture = { fixtureId, pokemon, moves: [], learnsets: [], evolution: {}, pokedexEntries: [] };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(sortKeys(JSON.parse(JSON.stringify(fixture))), null, 2) + '\n');
  const forms = pokemon.filter((entry) => entry.isDefault === false).length;
  console.log(`Exportados ${pokemon.length} Pokémon (${pokemon.length - forms} por defecto, ${forms} formas regionales) a ${target}`);
} finally {
  await prisma.$disconnect();
}
