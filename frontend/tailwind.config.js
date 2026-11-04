/** @type {import('tailwindcss').Config} */
// Tailwind solo para maquetación (spec §11): los colores, sombras y movimiento salen de los tokens en CSS Modules.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
  // Sustituye la escala por defecto: solo existen las capas del sistema (spec §2).
  zIndex: { content: 'var(--z-content)', hud: 'var(--z-hud)', sticky: 'var(--z-sticky)', cutin: 'var(--z-cutin)', toast: 'var(--z-toast)' },
  extend: {
    fontFamily: { display: ['"Baloo 2"', 'Nunito', 'system-ui', 'sans-serif'] },
    // Escala de la spec §3.2 (text-13 … text-68); 26 y mayores son de display, con interlineado 1.
    fontSize: {
      13: ['13px', { lineHeight: '1.3' }], 15: ['15px', { lineHeight: '1.3' }], 18: ['18px', { lineHeight: '1.3' }],
      22: ['22px', { lineHeight: '1.3' }], 26: ['26px', { lineHeight: '1' }], 34: ['34px', { lineHeight: '1' }],
      44: ['44px', { lineHeight: '1' }], 68: ['68px', { lineHeight: '1' }],
    },
  } },
  plugins: [],
};
