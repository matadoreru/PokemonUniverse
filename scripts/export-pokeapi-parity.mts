// Genera la evidencia de paridad Node de la sincronización de Pokémon (Tarea 8 de la etapa 2C) ejecutando el código
// real de Node contra las respuestas grabadas de backend/src/test/resources/datasync/pokeapi/.
//
// Uso (desde la raíz, con el Postgres de podman levantado y DATABASE_URL en el entorno o en .env):
//   npx tsx scripts/export-pokeapi-parity.mts
//
// Qué hace:
// 1. Crea la BD desechable `pu_parity_pokeapi` en el contenedor (PARITY_CONTAINER, por defecto
//    pokemonuniverse_postgres_1), aplica el esquema Prisma con `prisma db push` y aborta si la conexión no apunta a ella.
//    Nunca toca la BD de desarrollo; al terminar la borra.
// 2. Sustituye globalThis.fetch por un servidor de fixtures (ruta de PokéAPI o de raw.githubusercontent.com → fichero).
// 3. Copia apps/server/prisma/seed.ts junto al original cambiando SOLO los límites (rango 74..76 de la Pokédex nacional,
//    3 especies, mínimos de formas/movimientos/learnsets/entradas a 1) y ejecuta `syncPokemonData()`; vuelca las tablas
//    → expected-seed.json. Una segunda pasada sin force debe hacer 0 peticiones.
// 4. Ejecuta `backfillNormalizedData()` de PokemonDataSync y `syncMissingPokemonPalettes()` → expected-run.json.
// 5. Calcula `extractPokemonPaletteData` sobre los PNG de datasync/palette/ (los genera con sharp si faltan) y sobre el
//    sprite real 74.png → datasync/palette/expected.json.
// El volcado usa dump-tables.json (mismo SQL que PokemonCatalogSeederTest). Los ficheros resultantes se commitean.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtures = join(root, 'backend/src/test/resources/datasync/pokeapi');
const paletteDir = join(root, 'backend/src/test/resources/datasync/palette');
const container = process.env.PARITY_CONTAINER ?? 'pokemonuniverse_postgres_1';
const database = 'pu_parity_pokeapi';

function baseUrl(): URL {
  let value = process.env.DATABASE_URL;
  if (!value && existsSync(join(root, '.env'))) {
    value = /^DATABASE_URL=(.*)$/m.exec(readFileSync(join(root, '.env'), 'utf8'))?.[1]?.trim().replace(/^"|"$/g, '');
  }
  if (!value) throw new Error('DATABASE_URL is required');
  return new URL(value);
}

const source = baseUrl();
const user = decodeURIComponent(source.username);
const target = new URL(source.href);
target.pathname = `/${database}`;
target.search = '?schema=public';

function psql(sql: string): void {
  execFileSync('podman', ['exec', container, 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'inherit' });
}

/** fetch servido desde las fixtures: /api/v2/<ruta>[?query] → api/v2/<ruta>[@query].json; sprites desde raw/. */
let requests: string[] = [];
function fixtureFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  requests.push(url.href);
  let file: string;
  if (url.hostname === 'pokeapi.co') {
    file = join(fixtures, `${url.pathname.replace(/\/$/, '')}${url.search ? `@${url.search.slice(1)}` : ''}.json`);
  } else if (url.hostname === 'raw.githubusercontent.com') {
    file = join(fixtures, 'raw', url.pathname);
  } else {
    return Promise.resolve(new Response('not found', { status: 404 }));
  }
  if (!existsSync(file)) return Promise.resolve(new Response('not found', { status: 404 }));
  const body = readFileSync(file);
  return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': file.endsWith('.png') ? 'image/png' : 'application/json' } }));
}

function patchedSeed(): string {
  const original = readFileSync(join(root, 'apps/server/prisma/seed.ts'), 'utf8');
  const replacements: Array<[string, string, number]> = [
    ['const LAST_NATIONAL_DEX_NUMBER = 1_025;', 'const LAST_NATIONAL_DEX_NUMBER = 76; const SPECIES_TOTAL = 3;', 1],
    ['for (let start = 1; start <= LAST_NATIONAL_DEX_NUMBER;', 'for (let start = 74; start <= LAST_NATIONAL_DEX_NUMBER;', 2],
    ['enrichedDefaultCount < LAST_NATIONAL_DEX_NUMBER', 'enrichedDefaultCount < SPECIES_TOTAL', 1],
    ['evolutionCount < LAST_NATIONAL_DEX_NUMBER', 'evolutionCount < SPECIES_TOTAL', 1],
    ['metadataCount < LAST_NATIONAL_DEX_NUMBER', 'metadataCount < SPECIES_TOTAL', 1],
    ['const MIN_REGIONAL_FORM_COUNT = 58;', 'const MIN_REGIONAL_FORM_COUNT = 1;', 1],
    ['const MIN_LEARNSET_ENTRIES = 5_000;', 'const MIN_LEARNSET_ENTRIES = 1;', 1],
    ['const MIN_MOVE_COUNT = 500;', 'const MIN_MOVE_COUNT = 1;', 1],
    ['const MIN_SPANISH_POKEDEX_ENTRIES = 500;', 'const MIN_SPANISH_POKEDEX_ENTRIES = 1;', 1],
  ];
  let text = original;
  for (const [from, to, count] of replacements) {
    const found = text.split(from).length - 1;
    if (found !== count) throw new Error(`Expected ${count} occurrence(s) of ${from}, found ${found}`);
    text = text.split(from).join(to);
  }
  return text;
}

interface DumpSpec { excludedColumns: string[]; tables: Array<{ table: string; orderBy: string }> }

async function dump(prisma: { $queryRawUnsafe<T>(sql: string): Promise<T> }): Promise<Record<string, unknown[]>> {
  const spec = JSON.parse(readFileSync(join(fixtures, 'dump-tables.json'), 'utf8')) as DumpSpec;
  const minus = spec.excludedColumns.map((column) => ` - '${column}'`).join('');
  const result: Record<string, unknown[]> = {};
  for (const { table, orderBy } of spec.tables) {
    const rows = await prisma.$queryRawUnsafe<Array<{ row: unknown }>>(`SELECT to_jsonb(t)${minus} AS row FROM "${table}" t ORDER BY ${orderBy}`);
    result[table] = rows.map((entry) => entry.row);
  }
  return result;
}

function write(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
}

async function paletteFixtures(): Promise<void> {
  const sharp = (await import(pathToFileURL(join(root, 'apps/server/node_modules/sharp/lib/index.js')).href).catch(() => import('sharp'))).default;
  const block = (width: number, height: number, color: string) => sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
  const canvas = async (width: number, height: number, parts: Array<[number, number, number, number, string]>) => sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(await Promise.all(parts.map(async ([left, top, w, h, color]) => ({ input: await block(w, h, color), left, top })))).png().toBuffer();
  const cases: Record<string, () => Promise<Buffer>> = {
    // Tres bloques (como pokemon-palette-sync.test.ts) sobre fondo transparente; 12×12, sin redimensionar.
    'three-blocks.png': () => canvas(12, 12, [[0, 0, 6, 12, '#e85050'], [6, 0, 6, 6, '#3078d0'], [6, 6, 6, 6, '#f0c830']]),
    // Dos rojos a distancia < 42 se funden en el primero; más dos colores lejanos.
    'merge-close.png': () => canvas(10, 10, [[0, 0, 5, 6, '#e85050'], [5, 0, 5, 6, '#d84848'], [0, 6, 5, 4, '#3078d0'], [5, 6, 5, 4, '#f0c830']]),
    // Un único color: menos de 3 colores seleccionados.
    'single-color.png': () => canvas(8, 8, [[0, 0, 8, 8, '#3078d0']]),
    // Cuatro bloques con el mismo recuento: desempate por "r:g:b" con localeCompare (24: antes que 240:).
    'tie-break.png': () => canvas(8, 8, [[0, 0, 4, 4, '#f00000'], [4, 0, 4, 4, '#180000'], [0, 4, 4, 4, '#00f000'], [4, 4, 4, 4, '#001830']]),
    // 192×192 en bloques uniformes de 2×2 → 96×96 exacto (cualquier muestreo nearest da lo mismo).
    'resize-blocks.png': () => canvas(192, 192, [[0, 0, 96, 192, '#e85050'], [96, 0, 96, 64, '#3078d0'], [96, 64, 96, 64, '#f0c830'], [96, 128, 48, 64, '#58a848'], [144, 128, 48, 64, '#a050c0']]),
  };
  // Ruido determinista 150×100 → 96×64: el muestreo nearest no entero sí depende de la implementación.
  cases['resize-noise.png'] = async () => {
    const width = 150; const height = 100; const data = Buffer.alloc(width * height * 4); let seed = 12345;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    for (let index = 0; index < width * height; index += 1) {
      const palette = [[232, 80, 80], [48, 120, 208], [240, 200, 48], [88, 168, 72], [160, 80, 192], [40, 40, 40]][next() % 6]!;
      data[index * 4] = palette[0]!; data[index * 4 + 1] = palette[1]!; data[index * 4 + 2] = palette[2]!; data[index * 4 + 3] = next() % 5 === 0 ? 0 : 255;
    }
    return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  };
  mkdirSync(paletteDir, { recursive: true });
  for (const [name, make] of Object.entries(cases)) if (!existsSync(join(paletteDir, name))) writeFileSync(join(paletteDir, name), await make());
  const { extractPokemonPaletteData } = await import(pathToFileURL(join(root, 'apps/server/src/data-sync/pokemon-palette-sync.ts')).href);
  const expected: Record<string, unknown> = {};
  const inputs = [...Object.keys(cases).map((name) => [name, join(paletteDir, name)]), ['sprite-74.png', join(fixtures, 'raw/PokeAPI/sprites/master/sprites/pokemon/74.png')]];
  for (const [name, path] of inputs) {
    try {
      expected[name!] = await extractPokemonPaletteData(readFileSync(path!));
    } catch (error) {
      expected[name!] = { error: (error as Error).message };
    }
  }
  write(join(paletteDir, 'expected.json'), expected);
}

async function main(): Promise<void> {
  psql(`DROP DATABASE IF EXISTS ${database}`);
  psql(`CREATE DATABASE ${database}`);
  const seedCopy = join(root, 'apps/server/prisma/.seed-parity.tmp.ts');
  try {
    execFileSync(join(root, 'apps/server/node_modules/.bin/prisma'), ['db', 'push', '--skip-generate', '--schema', 'apps/server/prisma/schema.prisma'], { cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_URL: target.href } });
    process.env.DATABASE_URL = target.href;
    globalThis.fetch = fixtureFetch as typeof fetch;
    writeFileSync(seedCopy, patchedSeed());
    const seed = await import(pathToFileURL(seedCopy).href);
    const { prisma } = await import(pathToFileURL(join(root, 'apps/server/src/db.ts')).href);
    const [{ current_database: current }] = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>('SELECT current_database()');
    if (current !== database) throw new Error(`Refusing to run against ${current}`);

    await seed.syncPokemonData();
    write(join(fixtures, 'expected-seed.json'), await dump(prisma));
    const firstPass = requests.length;
    requests = [];
    await seed.syncPokemonData();
    if (requests.length !== 0) throw new Error(`Second pass made ${requests.length} requests`);

    const { PokemonDataSync } = await import(pathToFileURL(join(root, 'apps/server/src/data-sync/pokemon-data-sync.ts')).href);
    const { SyncHttpClient } = await import(pathToFileURL(join(root, 'apps/server/src/data-sync/http-client.ts')).href);
    const { syncMissingPokemonPalettes } = await import(pathToFileURL(join(root, 'apps/server/src/data-sync/pokemon-palette-sync.ts')).href);
    const http = new SyncHttpClient({ fetcher: fixtureFetch as typeof fetch });
    await (new PokemonDataSync(http) as any).backfillNormalizedData();
    const palettes = await syncMissingPokemonPalettes(http);
    write(join(fixtures, 'expected-run.json'), { palettes, tables: await dump(prisma) });
    console.info(`First pass requests: ${firstPass}; palettes: ${JSON.stringify(palettes)}`);
    await paletteFixtures();
    await prisma.$disconnect();
    await seed.default?.$disconnect?.();
  } finally {
    rmSync(seedCopy, { force: true });
    psql(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  }
}

await main();
process.exit(0);
