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
  } },
  plugins: [],
};
