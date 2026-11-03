/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
  // Sustituye la escala por defecto: solo existen las capas del sistema (spec §2).
  zIndex: { content: 'var(--z-content)', hud: 'var(--z-hud)', sticky: 'var(--z-sticky)', cutin: 'var(--z-cutin)', toast: 'var(--z-toast)' },
  extend: {
    colors: {
      ink: 'rgb(var(--color-ink) / <alpha-value>)', cream: 'rgb(var(--color-cream) / <alpha-value>)',
      surface: 'rgb(var(--color-surface) / <alpha-value>)', 'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
      night: 'rgb(var(--color-night) / <alpha-value>)', berry: 'rgb(var(--color-berry) / <alpha-value>)',
      electric: 'rgb(var(--color-electric) / <alpha-value>)', aqua: 'rgb(var(--color-aqua) / <alpha-value>)',
      leaf: 'rgb(var(--color-leaf) / <alpha-value>)',
    },
    fontFamily: { display: ['"Baloo 2"', 'Nunito', 'system-ui', 'sans-serif'], body: ['Nunito', 'system-ui', 'sans-serif'] },
    // Escala de la spec §3.2 (text-13 … text-68); 26 y mayores son de display, con interlineado 1.
    fontSize: {
      13: ['13px', { lineHeight: '1.3' }], 15: ['15px', { lineHeight: '1.3' }], 18: ['18px', { lineHeight: '1.3' }],
      22: ['22px', { lineHeight: '1.3' }], 26: ['26px', { lineHeight: '1' }], 34: ['34px', { lineHeight: '1' }],
      44: ['44px', { lineHeight: '1' }], 68: ['68px', { lineHeight: '1' }],
    },
    boxShadow: { card: 'var(--shadow-card)', pop: '0 4px 0 rgb(var(--color-night) / .8)' },
    // Presupuesto de movimiento (docs/visual-review.md): ciclos de 400 ms como máximo, solo transform y opacity.
    // `pulse` alterna la opacidad cada 400 ms y `spin` da la vuelta en 400 ms; la reducción global de styles.css las apaga.
    animation: { pulse: 'pulse 400ms ease-in-out infinite alternate', spin: 'spin 400ms linear infinite' },
    keyframes: { pulse: { from: { opacity: '1' }, to: { opacity: '.5' } } },
  } },
  plugins: [],
};
