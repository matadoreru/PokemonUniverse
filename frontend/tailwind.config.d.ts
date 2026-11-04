/** Tipos mínimos de la configuración de Tailwind, para que los tests la importen. */
declare const config: {
  content: string[];
  theme: { fontSize: Record<string, [string, { lineHeight: string }]>; extend: Record<string, unknown> } & Record<string, unknown>;
  plugins: unknown[];
};
export default config;
