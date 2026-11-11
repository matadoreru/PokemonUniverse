/** @type {import('tailwindcss').Config} */
// Tailwind solo para maquetación (spec §11): los colores, sombras y movimiento salen de los tokens en CSS Modules.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
  // Sustituye la escala por defecto: solo existen las capas del sistema (spec §2).
  zIndex: { content: 'var(--z-content)', hud: 'var(--z-hud)', sticky: 'var(--z-sticky)', cutin: 'var(--z-cutin)', toast: 'var(--z-toast)' },
  // También sustituye la escala por defecto: solo existe la de la spec §3.2 (text-13 … text-68), sin `text-xs` ni
  // `text-sm`; 26 y mayores son de display, con interlineado 1. En rem, como los --fs-*: siguen el ajuste de texto (E8).
  fontSize: {
    13: ['0.8125rem', { lineHeight: '1.3' }], 15: ['0.9375rem', { lineHeight: '1.3' }], 18: ['1.125rem', { lineHeight: '1.3' }],
    22: ['1.375rem', { lineHeight: '1.3' }], 26: ['1.625rem', { lineHeight: '1' }], 34: ['2.125rem', { lineHeight: '1' }],
    44: ['2.75rem', { lineHeight: '1' }], 68: ['4.25rem', { lineHeight: '1' }],
  },
  extend: {
    fontFamily: { display: ['"Baloo 2"', 'Nunito', 'system-ui', 'sans-serif'] },
  } },
  plugins: [],
};
