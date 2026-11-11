import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Reglas locales del sistema Arcade DS (F9): Tailwind solo maqueta y los iconos van por `Icon`.
const ALIAS = 'ink|cream|surface|surface-raised|night|berry|electric|aqua|leaf';
const COLOR_UTIL = 'text|bg|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow';
const STYLE_RULES = [
  // Tamaño de letra o color arbitrarios: la escala es `text-13` … `text-68` y el color va por tokens en CSS Modules.
  { re: /(?:^|[\s:!])text-\[/, message: 'Sin `text-[…]`: usa la escala `text-13`…`text-68` y el color por tokens en un CSS Module.' },
  { re: /(?:^|[\s:!])text-(?:xs|sm|base|lg|[2-9]?xl)(?=$|[\s/])/, message: 'Tamaño de letra fuera de la escala del sistema: usa `text-13`…`text-68`.' },
  { re: new RegExp(`(?:^|[\\s:!-])(?:${COLOR_UTIL})-\\[(?:color:|#|rgba?\\(|hsla?\\(|var\\()`), message: 'Sin colores arbitrarios en `className`: el color va por tokens en un CSS Module.' },
  // Un color dentro de una sombra o un anillo arbitrario (`shadow-[0_0_0_2px_#fff]`, `ring-[…rgba(…)]`): no va justo tras `[`.
  { re: /(?:^|[\s:!-])(?:shadow|ring|ring-offset|drop-shadow)-\[[^\]]*(?:#|rgba?\(|hsla?\()/, message: 'Sin colores arbitrarios en sombras ni anillos: el color va por tokens (`var(--…)`) o en un CSS Module.' },
  { re: /(?:^|[\s:!-])z-\[/, message: 'Sin `z-[…]`: usa las capas del sistema (`z-content`, `z-hud`, `z-sticky`, `z-cutin`, `z-toast`).' },
  { re: new RegExp(`(?:^|[\\s:!-])(?:${COLOR_UTIL})-(?:${ALIAS})(?=$|[\\s/])`), message: 'Alias de color heredado (borrado en F9): usa los tokens del sistema en un CSS Module.' },
  { re: /(?:^|[\s:!])shadow-(?:card|pop)(?=$|\s)/, message: 'Sombra heredada (borrada en F9): usa los tokens `--sh-*` en un CSS Module.' },
];

/*
 * Parte H: fuera de `ui/`, Tailwind no da forma. Rechaza `rounded*`, `border*` y `shadow*` (con o sin variantes como
 * `md:` o `hover:`, y con `!`) como clase entera: `drop-shadow-*` (filtro), las clases de CSS Modules y palabras como
 * `bordered` no casan. Solo se admite la maqueta de tablas (`border-collapse`, `border-separate`, `border-spacing-*`).
 */
const SHAPE_RULE = {
  re: /(?:^|\s)!?(?:[\w[\]&@().:>_*-]+:)?!?(?:rounded|border|shadow)(?!-(?:collapse|separate|spacing)(?:$|[\s-]))(?:-\S*)?(?=$|\s)/,
  message: 'Sin `rounded*`, `border*` ni `shadow*` de Tailwind fuera de `ui/`: la forma sale de un componente de `ui/` o de un CSS Module sobre `--r-*`, `--ol-*` y `--sh-*`.',
};

/** Literales de texto de una expresión (sin entrar en `parent`). */
function stringParts(node, out = []) {
  if (!node || typeof node.type !== 'string') return out;
  if (node.type === 'Literal' && typeof node.value === 'string') out.push({ node, text: node.value });
  else if (node.type === 'TemplateElement') out.push({ node, text: node.value.cooked ?? node.value.raw });
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) value.forEach((child) => stringParts(child, out));
    else if (value && typeof value.type === 'string') stringParts(value, out);
  }
  return out;
}

/** Regla que revisa cada literal de `className` y de los argumentos de `cx(…)` contra `rules`. */
function classLiteralRule(rules) {
  return {
    meta: { type: 'problem', schema: [] },
    create(context) {
      // Un `cx()` dentro de `className` se recorre dos veces: cada literal se revisa una sola.
      const seen = new WeakSet();
      function check(node) {
        for (const part of stringParts(node)) {
          if (seen.has(part.node)) continue;
          seen.add(part.node);
          for (const rule of rules) if (rule.re.test(part.text)) context.report({ node: part.node, message: rule.message });
        }
      }
      return {
        JSXAttribute(node) { if (node.name.type === 'JSXIdentifier' && /className$/i.test(node.name.name)) check(node.value); },
        CallExpression(node) { if (node.callee.type === 'Identifier' && node.callee.name === 'cx') node.arguments.forEach(check); },
      };
    },
  };
}

const arcade = {
  rules: {
    'no-arbitrary-style': classLiteralRule(STYLE_RULES),
    'no-tailwind-shape': classLiteralRule([SHAPE_RULE]),
    'no-raw-lucide': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const names = new Set();
        const namespaces = new Set();
        const message = 'Los iconos de `lucide-react` se pintan con `Icon` del catálogo o con la prop `icon`, no como JSX directo.';
        return {
          ImportDeclaration(node) {
            if (node.source.value !== 'lucide-react') return;
            for (const spec of node.specifiers) (spec.type === 'ImportNamespaceSpecifier' ? namespaces : names).add(spec.local.name);
          },
          JSXOpeningElement(node) {
            const { name } = node;
            if (name.type === 'JSXIdentifier' && names.has(name.name)) context.report({ node, message });
            else if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier' && namespaces.has(name.object.name)) context.report({ node, message });
          },
        };
      },
    },
  },
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  {
    files: ['frontend/src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', {
      patterns: [{ group: ['**/shared/src/**'], message: 'Import the built contracts from @pokemon-universe/shared/public.' }],
    }] },
  },
  {
    files: ['frontend/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { arcade },
    rules: { 'arcade/no-arbitrary-style': 'error' },
  },
  {
    files: ['frontend/src/**/*.tsx'],
    ignores: ['**/*.test.tsx', 'frontend/src/ui/**'],
    plugins: { arcade },
    rules: { 'arcade/no-raw-lucide': 'error', 'arcade/no-tailwind-shape': 'error' },
  },
);
