/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { ink: '#172033', cream: '#fff9ed', berry: '#ef476f', electric: '#ffd166', aqua: '#49c6e5', leaf: '#5bb98c' },
    fontFamily: { display: ['Fredoka', 'ui-rounded', 'system-ui'], body: ['Nunito', 'system-ui'] },
    boxShadow: { card: '0 18px 50px rgba(27, 36, 58, .12)', pop: '0 8px 0 #172033' },
  } },
  plugins: [],
};
