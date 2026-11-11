// Configuración de Playwright para los E2E de Pokémon Universe.
//
// - Solo Chromium. En Fedora: `npx playwright install chromium` (sin `--with-deps`,
//   que asume apt).
// - Corre contra la BD local de desarrollo: carga el `.env` de la raíz y arranca el
//   backend Java (`:8080`) y la web (`:5173`) si no están ya levantados. Desde el corte 2D
//   la web habla solo con Java (HTTP y el WebSocket `/ws`); Node no se arranca.
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
      // Backend Java: toda la API y las salas (ver proxyFor de vite.config.ts). Su data-sync queda apagado salvo
      // que el shell exporte BACKEND_DATA_SYNC_ENABLED=true. PORT fijo porque el .env puede traer PORT=3001 (el del
      // antiguo servidor Node); JWT_SECRET llega del .env cargado. ROOM_MAX_PLAYERS fijo: sala.spec.ts espera el contador
      // "2 / 8" y no debe depender del .env. SMTP_* apunta al Mailpit de compose.local.yaml (recuperar-contrasena.spec.ts
      // lee los correos de su API en :8025). ROOM_RESULTS_AUTO_CONTINUE_MS alarga a 2 min la espera de los resultados
      // antes de que la sesión siga sola (20 s en producción): así ningún spec compite con ella mientras captura los
      // resultados a tres tamaños o pulsa «Continuar sesión». La cuenta atrás se sigue viendo (sesion.spec.ts).
      // ROOM_GAME_INTRO_MS alarga a 20 s la intro de cada partida (8 s en producción): los helpers pulsan «¡Listo!» por
      // cada jugador (`pasarIntro`, `listoAutomatico`), así que un arranque que se lo salta se nota, y intro.spec.ts
      // tiene tiempo de capturarla a tres tamaños.
      command: 'npm run dev:backend',
      url: 'http://localhost:8080/health',
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: { PORT: '8080', MICRONAUT_ENVIRONMENTS: 'dev', RATE_LIMIT_DISABLED: 'true', COOKIE_SECURE: 'false', ROOM_MAX_PLAYERS: '8', ROOM_RESULTS_AUTO_CONTINUE_MS: '120000', ROOM_GAME_INTRO_MS: '20000', SMTP_HOST: 'localhost', SMTP_PORT: '1025' },
    },
    {
      command: 'npm run dev -w @pokemon-universe/web',
      url: 'http://localhost:5173',
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      // VITE_API_URL vacío para que un valor suelto del shell no mande al navegador cross-origin.
      env: { VITE_API_URL: '' },
    },
  ],
});
