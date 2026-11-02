// Genera la evidencia de paridad Node del catálogo TCG y de la sincronización con TCGdex (Tarea 9 de la etapa 2C)
// ejecutando el código real de Node sobre las fixtures de backend/src/test/resources/{tcg,datasync/tcgdex}/.
//
// Uso (desde la raíz, con el Postgres de podman levantado y DATABASE_URL en el entorno o en .env):
//   npx tsx scripts/export-tcg-parity.mts            # todo
//   npx tsx scripts/export-tcg-parity.mts --no-db    # solo catálogo en memoria y validación (sin BD)
//
// Qué hace:
// 1. Catálogo en memoria: `CachedTcgCardCatalog` de Node con un repositorio que devuelve tcg/catalog-rows.json;
//    `cardsFor` para cada filtro de tcg/catalog-cases.json y `options()` → tcg/expected-catalog.json.
// 2. Validación de /api/tcg/eligibility: `tcgHigherLowerConfigSchema.safeParse` sobre tcg/eligibility-cases.json →
//    tcg/expected-eligibility.json ({data} si es válido, {error, issues} como el manejador global, o {throws}).
// 3. Con BD: crea la BD desechable `pu_parity_tcgdex` en el contenedor (PARITY_CONTAINER, por defecto
//    pokemonuniverse_postgres_1), aplica el esquema con `prisma db push` y aborta si la conexión no apunta a ella;
//    inserta los Pokémon de tcg/pokemon-rows.json; sustituye fetch por las respuestas grabadas de
//    datasync/tcgdex/api (api.tcgdex.net/v2/en/<ruta> → api/v2/en/<ruta>.json); ejecuta `TcgDataSync.run('INITIAL')`
//    y vuelca las 4 tablas TCG (dump-tables.json); lee `PrismaTcgCardRepository.loadComparableCards()` y el
//    `options()` del catálogo sobre esas filas; después sirve las cartas de datasync/tcgdex/refresh/ por encima de las
//    anteriores y ejecuta `run('PRICE_REFRESH')` → datasync/tcgdex/expected-sync.json. Al terminar borra la BD.
// Los ficheros resultantes se commitean.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tcgFixtures = join(root, 'backend/src/test/resources/tcg');
const syncFixtures = join(root, 'backend/src/test/resources/datasync/tcgdex');
const container = process.env.PARITY_CONTAINER ?? 'pokemonuniverse_postgres_1';
const database = 'pu_parity_tcgdex';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
function write(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`); }
const sharedModule = () => import(pathToFileURL(join(root, 'packages/shared/src/index.ts')).href);
const serverModule = (path: string) => import(pathToFileURL(join(root, 'apps/server/src', path)).href);

async function catalogParity(): Promise<void> {
  const { CachedTcgCardCatalog } = await serverModule('tcg/comparable-price.ts');
  const rows = read(join(tcgFixtures, 'catalog-rows.json')).map((row: any) => ({ ...row, prices: row.prices.map((price: any) => ({ ...price, observedAt: new Date(price.observedAt) })) }));
  const catalog = new CachedTcgCardCatalog({ findById: async () => null, count: async () => rows.length, loadComparableCards: async () => rows });
  await catalog.refresh();
  const cases: Record<string, unknown> = {};
  for (const [name, filters] of Object.entries(read(join(tcgFixtures, 'catalog-cases.json')))) cases[name] = catalog.cardsFor(filters);
  write(join(tcgFixtures, 'expected-catalog.json'), { cardsFor: cases, options: catalog.options() });
}

async function eligibilityParity(): Promise<void> {
  const { tcgHigherLowerConfigSchema } = await sharedModule();
  const expected: Record<string, unknown> = {};
  for (const [name, body] of Object.entries(read(join(tcgFixtures, 'eligibility-cases.json')))) {
    try {
      const result = tcgHigherLowerConfigSchema.safeParse(body);
      expected[name] = result.success ? { data: result.data } : { error: result.error.issues[0]?.message, issues: result.error.issues };
    } catch (error) {
      expected[name] = { throws: (error as Error).message };
    }
  }
  write(join(tcgFixtures, 'expected-eligibility.json'), expected);
}

function baseUrl(): URL {
  let value = process.env.DATABASE_URL;
  if (!value && existsSync(join(root, '.env'))) {
    value = /^DATABASE_URL=(.*)$/m.exec(readFileSync(join(root, '.env'), 'utf8'))?.[1]?.trim().replace(/^"|"$/g, '');
  }
  if (!value) throw new Error('DATABASE_URL is required');
  return new URL(value);
}

let overlay = false;
const requests: string[] = [];
function fixtureFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  requests.push(url.pathname);
  if (url.hostname !== 'api.tcgdex.net') return Promise.resolve(new Response('not found', { status: 404 }));
  const path = `${decodeURIComponent(url.pathname)}.json`;
  const candidates = [...(overlay ? [join(syncFixtures, 'refresh/api', path)] : []), join(syncFixtures, 'api', path)];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return Promise.resolve(new Response('not found', { status: 404 }));
  return Promise.resolve(new Response(readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } }));
}

interface DumpSpec { tables: Array<{ table: string; orderBy: string; exclude: string[] }> }
async function dump(prisma: { $queryRawUnsafe<T>(sql: string): Promise<T> }): Promise<Record<string, unknown[]>> {
  const spec = read(join(syncFixtures, 'dump-tables.json')) as DumpSpec;
  const result: Record<string, unknown[]> = {};
  for (const { table, orderBy, exclude } of spec.tables) {
    const minus = exclude.map((column) => ` - '${column}'`).join('');
    const rows = await prisma.$queryRawUnsafe<Array<{ row: string }>>(`SELECT CAST(to_jsonb(t)${minus} AS text) AS row FROM "${table}" t ORDER BY ${orderBy}`);
    result[table] = rows.map((entry) => JSON.parse(entry.row));
  }
  return result;
}

async function syncParity(): Promise<void> {
  const source = baseUrl();
  const user = decodeURIComponent(source.username);
  const target = new URL(source.href);
  target.pathname = `/${database}`;
  target.search = '?schema=public';
  const psql = (sql: string) => execFileSync('podman', ['exec', container, 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'inherit' });
  psql(`DROP DATABASE IF EXISTS ${database}`);
  psql(`CREATE DATABASE ${database}`);
  try {
    execFileSync(join(root, 'apps/server/node_modules/.bin/prisma'), ['db', 'push', '--skip-generate', '--schema', 'apps/server/prisma/schema.prisma'], { cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_URL: target.href } });
    process.env.DATABASE_URL = target.href;
    globalThis.fetch = fixtureFetch as typeof fetch;
    const { prisma } = await serverModule('db.ts');
    const [{ current_database: current }] = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>('SELECT current_database()');
    if (current !== database) throw new Error(`Refusing to run against ${current}`);
    for (const row of read(join(tcgFixtures, 'pokemon-rows.json'))) {
      await prisma.$executeRawUnsafe(`INSERT INTO "Pokemon" ("id", "nationalDexNumber", "name", "generation", "isDefault", "sprite", "abilities", "types", "updatedAt") VALUES ($1, $2, $1, $3, $4, 'https://img.test/x.png', '{}', '{}', now())`, row.id, row.nationalDexNumber, row.generation, row.isDefault);
    }
    const { TcgDataSync } = await serverModule('data-sync/tcg-data-sync.ts');
    const { SyncHttpClient } = await serverModule('data-sync/http-client.ts');
    const { PrismaTcgCardRepository } = await serverModule('tcg/repository.ts');
    const { CachedTcgCardCatalog } = await serverModule('tcg/comparable-price.ts');
    const sync = new TcgDataSync(new SyncHttpClient({ fetcher: fixtureFetch as typeof fetch }));
    const initial = await sync.run('INITIAL');
    const initialRequests = [...requests];
    const initialTables = await dump(prisma);
    const repository = new PrismaTcgCardRepository(prisma);
    const loaded = (await repository.loadComparableCards()).map((card: any) => ({ ...card, pokemonGenerations: [...card.pokemonGenerations].sort((a: number, b: number) => a - b), prices: card.prices.map((price: any) => ({ ...price, observedAt: undefined })).sort((a: any, b: any) => `${a.provider}\0${a.currency}\0${a.variant}` < `${b.provider}\0${b.currency}\0${b.variant}` ? -1 : 1) })).sort((a: any, b: any) => (a.id < b.id ? -1 : 1));
    const catalog = new CachedTcgCardCatalog(repository);
    await catalog.refresh();
    const allGenerations = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const pool = catalog.cardsFor({ generations: allGenerations, setIds: [], rarities: [], minPrice: null, maxPrice: null });
    requests.length = 0;
    overlay = true;
    const refresh = await sync.run('PRICE_REFRESH');
    const refreshRequests = [...requests].sort();
    write(join(syncFixtures, 'expected-sync.json'), {
      initial: { result: initial, requests: initialRequests, tables: initialTables },
      catalog: { loaded, options: catalog.options(), allGenerations: [...pool].sort((a: any, b: any) => (a.id < b.id ? -1 : 1)) },
      priceRefresh: { result: refresh, requests: refreshRequests, tables: await dump(prisma) },
    });
    await prisma.$disconnect();
  } finally {
    psql(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  }
}

await catalogParity();
await eligibilityParity();
if (!process.argv.includes('--no-db')) await syncParity();
process.exit(0);
