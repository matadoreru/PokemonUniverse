/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: {
      ink: 'rgb(var(--color-ink) / <alpha-value>)', cream: 'rgb(var(--color-cream) / <alpha-value>)',
      surface: 'rgb(var(--color-surface) / <alpha-value>)', 'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
      night: 'rgb(var(--color-night) / <alpha-value>)', berry: 'rgb(var(--color-berry) / <alpha-value>)',
      electric: 'rgb(var(--color-electric) / <alpha-value>)', aqua: 'rgb(var(--color-aqua) / <alpha-value>)',
      leaf: 'rgb(var(--color-leaf) / <alpha-value>)',
    },
    fontFamily: { display: ['Fredoka', 'ui-rounded', 'system-ui'], body: ['Nunito', 'system-ui'] },
    boxShadow: { card: 'var(--shadow-card)', pop: '0 4px 0 rgb(var(--color-night) / .8)' },
    // Presupuesto de movimiento (docs/visual-review.md): ciclos de 400 ms como máximo, solo transform y opacity.
    // `pulse` alterna la opacidad cada 400 ms y `spin` da la vuelta en 400 ms; la reducción global de styles.css las apaga.
    animation: { pulse: 'pulse 400ms ease-in-out infinite alternate', spin: 'spin 400ms linear infinite' },
    keyframes: { pulse: { from: { opacity: '1' }, to: { opacity: '.5' } } },
  } },
  plugins: [],
};
