/// <reference types="node" />
/**
 * Clases globales (F9): todo `className` de los `.tsx` nombra una clase que existe. Lo que no es de CSS Modules ni lo
 * genera Tailwind tiene que estar definido en styles.css; así no queda nadie apuntando a una clase heredada borrada.
 *
 * Límite aceptado: solo ve los literales escritos en `className`/`*ClassName` o en `cx(…)` (y sus ramas). Una clase que
 * llega por variable o la devuelve una función (`const c = 'x'; className={c}`, como `RevealCutIn.tsx`) no se revisa.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss, { type Config } from 'tailwindcss';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..');

/**
 * Lista corta de clases sin CSS a propósito: los marcadores de Tailwind para variantes (`group`, `peer`) y los ganchos
 * de E2E y tests (`ScorePop.tsx`, `RoomSessionLayout.tsx`). Los ganchos que estiliza un módulo con `:global(.x)` ya
 * cuentan como definidos.
 */
const SIN_CSS = new Set(['group', 'peer', 'score-pop-anim', 'connection-notice', 'connection-notice-region']);

function cssModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? cssModules(p) : e.name.endsWith('.module.css') ? [p] : [];
  });
}

/** Clases globales que los CSS Modules estilizan con `:global(.x)`. */
function moduleGlobals(): Set<string> {
  const names = new Set<string>();
  for (const file of cssModules(src)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/:global\(([^)]*)\)/g)) for (const name of classSelectors(m[1]!)) names.add(name);
  }
  return names;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx') ? [p] : [];
  });
}

/** Partes de texto fijas de una expresión: literales, plantillas y ramas de condicionales y `&&`/`||`. */
function literalParts(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isTemplateExpression(node)) {
    // Los trozos pegados a `${…}` son nombres a medias (`tipo-${t}`): se descartan y se mira solo lo completo.
    const trozos = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
    trozos.forEach((texto, i) => {
      const palabras = texto.split(/\s+/);
      if (i > 0 && !/^\s/.test(texto)) palabras.shift();
      if (i < trozos.length - 1 && !/\s$/.test(texto)) palabras.pop();
      out.push(palabras.join(' '));
    });
    node.templateSpans.forEach((span) => literalParts(span.expression, out));
  } else if (ts.isConditionalExpression(node)) {
    literalParts(node.whenTrue, out);
    literalParts(node.whenFalse, out);
  } else if (ts.isBinaryExpression(node)) {
    // `a && 'x'` solo aporta la derecha; `||`, `??` y `+` aportan los dos lados; las comparaciones, nada.
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) literalParts(node.right, out);
    else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) {
      literalParts(node.left, out);
      literalParts(node.right, out);
    }
  } else if (ts.isParenthesizedExpression(node) || ts.isJsxExpression(node)) {
    if (node.expression) literalParts(node.expression, out);
  } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'cx') {
    node.arguments.forEach((arg) => literalParts(arg, out));
  } else if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((el) => literalParts(el, out));
  }
}

/** Clases que nombra cada `.tsx`: atributos `className` y argumentos de `cx(…)`. */
function usedClasses(): Map<string, Set<string>> {
  const uses = new Map<string, Set<string>>();
  for (const file of tsxFiles(src)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const parts: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isJsxAttribute(node) && /^(className|\w+ClassName)$/.test(node.name.getText(source)) && node.initializer) literalParts(node.initializer, parts);
      else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'cx') literalParts(node, parts);
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const name of parts.join(' ').split(/\s+/).filter(Boolean)) {
      if (!uses.has(name)) uses.set(name, new Set());
      uses.get(name)!.add(path.relative(src, file));
    }
  }
  return uses;
}

/** Nombres de clase de una hoja (sin comentarios ni `url(…)`), con los escapes de CSS ya resueltos. */
function classSelectors(css: string): Set<string> {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '');
  const names = new Set<string>();
  for (const m of limpio.matchAll(/\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[\w-])+)/g)) {
    names.add(m[1]!.replace(/\\([0-9a-fA-F]{1,6}) ?/g, (_x, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, '$1'));
  }
  return names;
}

describe('clases globales de los .tsx', () => {
  it('cada clase que no es de Tailwind está definida en styles.css', async () => {
    const uses = usedClasses();
    const candidates = [...uses.keys()];
    const generated = await postcss([
      tailwindcss({ ...(tailwindConfig as unknown as Config), content: [{ raw: candidates.join(' '), extension: 'html' }], corePlugins: { preflight: false } }),
    ]).process('@tailwind components; @tailwind utilities;', { from: undefined });
    const tailwind = classSelectors(generated.css);
    const globals = new Set([...classSelectors(readFileSync(path.join(src, 'styles.css'), 'utf8')), ...moduleGlobals()]);
    const unknown = candidates
      .filter((name) => !tailwind.has(name) && !globals.has(name) && !SIN_CSS.has(name))
      .map((name) => `${name} (${[...uses.get(name)!].join(', ')})`);
    expect(unknown).toEqual([]);
    // Analiza todos los .tsx y genera Tailwind entero; con la suite en paralelo puede pasar de un minuto.
  }, 180_000);

  it('detecta una clase inexistente', () => {
    expect(classSelectors('.content-row { x: 1 } .sm\\:grid-cols-\\[1fr_auto\\]:hover { y: 2 }')).toEqual(new Set(['content-row', 'sm:grid-cols-[1fr_auto]']));
  });
});
