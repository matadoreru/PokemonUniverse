// Configuración de Playwright para los E2E de Pokémon Universe.
//
// - Solo Chromium. En Fedora: `npx playwright install chromium` (sin `--with-deps`,
//   que asume apt).
// - Corre contra la BD local de desarrollo: carga el `.env` de la raíz y arranca
//   servidor (`:3001`), backend Java (`:8080`) y web (`:5173`) si no están ya levantados.
// - Todo pasa por el proxy de Vite, así que `baseURL` es la web y no se define
//   `VITE_API_URL`.
// - Las capturas de revisión van a `e2e/screenshots/`.
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* sin .env: se espera env en el shell */
}

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
    // Playwright emula `light` por defecto; la app cae en `prefers-color-scheme`
    // si no hay tema guardado, así que se fija el oscuro (el tema por defecto).
    colorScheme: 'dark',
    viewport: { width: 1280, height: 720 },
    locale: 'es-ES',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [
    {
      // El servidor compila `shared` desde `dist`: hay que construirlo antes.
      command: 'npm run build -w @pokemon-universe/shared && npm run dev -w @pokemon-universe/server',
      url: 'http://localhost:3001/api/health',
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // ROOM_MAX_PLAYERS fijo: sala.spec.ts espera el contador "2 / 8" y no debe depender del .env.
      env: { DATA_SYNC_ENABLED: 'false', RATE_LIMIT_DISABLED: 'true', COOKIE_SECURE: 'false', ROOM_MAX_PLAYERS: '8' },
    },
    {
      // Backend Java: auth, perfil, novedades, feedback, juegos y Pokémon (ver vite.config.ts).
      // PORT fijo porque el .env exporta PORT=3001 para Node; JWT_SECRET llega del .env cargado.
      command: 'npm run dev:backend',
      url: 'http://localhost:8080/health',
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: { PORT: '8080', MICRONAUT_ENVIRONMENTS: 'dev', RATE_LIMIT_DISABLED: 'true', COOKIE_SECURE: 'false' },
    },
    {
      command: 'npm run dev -w @pokemon-universe/web',
      url: 'http://localhost:5173',
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      // Vacío para que un valor suelto del shell no mande al navegador cross-origin.
      env: { VITE_API_URL: '' },
    },
  ],
});
