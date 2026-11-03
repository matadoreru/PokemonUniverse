/** Tipos mínimos de la configuración de Tailwind, para que los tests la importen. */
declare const config: {
  content: string[];
  theme: { extend: { fontSize?: Record<string, [string, { lineHeight: string }]> } & Record<string, unknown> };
  plugins: unknown[];
};
export default config;
