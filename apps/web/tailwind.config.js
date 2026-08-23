/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: {
      ink: '#e8edf7', cream: '#090d18', surface: '#141b2b', 'surface-raised': '#1b2436', night: '#050811',
      berry: '#ff5c82', electric: '#f0bf54', aqua: '#52c7e8', leaf: '#62c995',
    },
    fontFamily: { display: ['Fredoka', 'ui-rounded', 'system-ui'], body: ['Nunito', 'system-ui'] },
    boxShadow: { card: '0 18px 50px rgba(0, 0, 0, .32)', pop: '0 8px 0 #050811' },
  } },
  plugins: [],
};
