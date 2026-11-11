/// <reference types="node" />
/**
 * Tokens (spec Arcade DS §3): el espejo tokens.ts coincide con tokens.css, las parejas de texto
 * cumplen AA y las capas están ordenadas.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import tailwind from '../../tailwind.config.js';
import { CUTIN_HOLD_MS } from '../ui/Cutin';
import { SCORE_POP_MS } from '../ui/ScorePop';
import { bestInk, colors, contrast, cssName, fontSizes, layers, typeColors, typeInk, type PokemonType } from './tokens';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, 'tokens.css'), 'utf8');
const rootStart = css.indexOf(':root {');
// El bloque `:root` acaba en la primera llave de cierre a principio de línea.
const rootBlock = css.slice(rootStart, css.indexOf('\n}', rootStart));
const styles = readFileSync(path.join(here, '..', 'styles.css'), 'utf8');

function cssHex(name: string): string {
  const m = rootBlock.match(new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{6});`, 'm'));
  if (!m) throw new Error(`token ${name} no encontrado en tokens.css`);
  return m[1]!.toUpperCase();
}

/** Mezcla `fg` con opacidad `alpha` sobre `bg` (ambos `#rrggbb`). */
function mix(fg: string, bg: string, alpha: number): string {
  const ch = (h: string, i: number): number => parseInt(h.slice(1 + i, 3 + i), 16);
  const out = [0, 2, 4].map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

const tipos = Object.keys(typeColors) as PokemonType[];

describe('tokens.css ↔ tokens.ts', () => {
  it('cada color del espejo coincide con el CSS', () => {
    for (const [k, v] of Object.entries(colors)) expect(cssHex(cssName[k as keyof typeof colors]), k).toBe(v);
  });
  it('hay 18 tipos y cada color coincide con --type-<t>', () => {
    expect(tipos).toHaveLength(18);
    for (const t of tipos) expect(cssHex(`--type-${t}`), t).toBe(typeColors[t]);
  });
  it('la tinta de cada tipo coincide con --type-<t>-ink', () => {
    for (const t of tipos) {
      const m = rootBlock.match(new RegExp(`--type-${t}-ink:\\s*var\\(--(navy|white)\\);`));
      expect(m, `--type-${t}-ink`).not.toBeNull();
      expect(m![1] === 'navy' ? colors.navy : colors.white, t).toBe(typeInk[t]);
    }
  });
  it('la escala tipográfica del CSS es la cerrada', () => {
    for (const n of fontSizes) expect(rootBlock).toContain(`--fs-${n}: ${n}px;`);
    const declarados = [...rootBlock.matchAll(/--fs-(\d+):/g)].map((m) => Number(m[1]));
    expect(declarados).toEqual([...fontSizes]);
  });
});

describe('contraste AA de las parejas de texto (§3.1)', () => {
  const normal: [string, string, string][] = [
    ['blanco sobre navy', colors.white, colors.navy],
    ['blanco sobre navy-2', colors.white, colors.navy2],
    ['blanco sobre navy-3', colors.white, colors.navy3],
    ['blanco sobre blue', colors.white, colors.blue],
    ['blanco sobre blue-d', colors.white, colors.blueD],
    ['ink sobre cream', colors.ink, colors.cream],
    ['ink-2 sobre cream', colors.ink2, colors.cream],
    ['navy sobre yellow', colors.navy, colors.yellow],
    ['navy sobre cream', colors.navy, colors.cream],
    ['navy sobre ok', colors.navy, colors.ok],
    ['navy sobre warn', colors.navy, colors.warn],
    ['navy sobre bad', colors.navy, colors.bad],
    ['navy sobre info', colors.navy, colors.info],
    ['blanco sobre red-text', colors.white, colors.redText],
    ['blanco sobre red-d', colors.white, colors.redD],
    ['yellow sobre navy-2', colors.yellow, colors.navy2],
    ['sky-2 sobre navy-2', colors.sky2, colors.navy2],
  ];
  it.each(normal)('%s ≥ 4,5:1', (_n, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('blanco sobre red (solo texto grande) ≥ 3:1', () => {
    expect(contrast(colors.white, colors.red)).toBeGreaterThanOrEqual(3);
  });
  it.each(tipos)('tipo %s: su tinta es la de más contraste y llega a 4,5:1', (t) => {
    expect(contrast(typeInk[t], typeColors[t])).toBeGreaterThanOrEqual(4.5);
    expect(typeInk[t]).toBe(bestInk(typeColors[t]));
  });
  it('texto secundario: blanco al 60 % sobre navy ≥ 4,5:1', () => {
    expect(contrast(mix(colors.white, colors.navy, 0.6), colors.navy)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('rayas de fondo (§3.3)', () => {
  /** Opacidad de la raya clara de `--stripes-<nombre>` y su color, leídos de tokens.css. */
  function stripe(name: string): { hex: string; alpha: number } {
    const m = rootBlock.match(new RegExp(`--stripes-${name}:\\s*repeating-linear-gradient\\(135deg, rgb\\((\\d+) (\\d+) (\\d+) / ([\\d.]+)\\)`));
    if (!m) throw new Error(`--stripes-${name} no encontrado en tokens.css`);
    const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    return { hex, alpha: Number(m[4]) };
  }
  it('blanco sobre azul con rayas ≥ 4,5:1', () => {
    const { hex, alpha } = stripe('blue');
    expect(hex).toBe(colors.white);
    expect(contrast(colors.white, mix(hex, colors.blue, alpha))).toBeGreaterThanOrEqual(4.5);
  });
  it('red-d sobre crema con rayas ≥ 4,5:1 (texto de error en crema)', () => {
    const { hex, alpha } = stripe('cream');
    expect(hex).toBe(colors.navy);
    const fondo = mix(hex, colors.cream, alpha);
    expect(contrast(colors.redD, fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.ink2, fondo)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('capas (§3.5)', () => {
  it('orden: content < hud < sticky < cutin < toast', () => {
    expect(layers.content).toBeLessThan(layers.hud);
    expect(layers.hud).toBeLessThan(layers.sticky);
    expect(layers.sticky).toBeLessThan(layers.cutin);
    expect(layers.cutin).toBeLessThan(layers.toast);
  });
  it('cada valor coincide con su --z-* del CSS', () => {
    for (const [k, v] of Object.entries(layers)) expect(rootBlock, k).toMatch(new RegExp(`--z-${k}:\\s*${v};`));
  });
});

describe('sin alias heredados (§11, F9)', () => {
  it('styles.css ya no define los alias `--color-*` ni la remezcla `.on-cream`', () => {
    expect(styles).not.toMatch(/--color-[a-z-]+:/);
    expect(styles).not.toMatch(/rgb\(var\(--color-/);
    expect(styles).not.toContain('.on-cream');
  });
  it('tailwind.config no tiene colores ni sombras propios: solo maquetación', () => {
    expect(tailwind.theme.extend).not.toHaveProperty('colors');
    expect(tailwind.theme.extend).not.toHaveProperty('boxShadow');
  });
  /*
   * Cada superficie crema compone `cream` de `ui/surfaces.module.css` (sin `.on-cream`): anillo de foco azul noche,
   * cursor azul oscuro y controles nativos en claro. El texto de diálogos, paneles crema, pestañas y campos va en --ink.
   */
  it('surfaces.module.css .cream: foco, cursor y esquema de color del crema', () => {
    const source = readFileSync(path.join(here, '..', 'ui', 'surfaces.module.css'), 'utf8');
    const block = source.match(/\n\.cream\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toMatch(/--focus-ring:\s*var\(--navy\);/);
    expect(block).toMatch(/--focus-ring-on-yellow:\s*var\(--navy\);/);
    expect(block).toMatch(/color-scheme:\s*light;/);
    expect(block).toMatch(/--caret:\s*var\(--blue-d\);/);
  });
  it.each([
    ['ui/Panel.module.css', '.cream', true],
    ['ui/Dialog.module.css', '.dialog', true],
    ['ui/Tabs.module.css', '.panel', true],
    ['ui/Field.module.css', '.field', true],
    ['ui/Drawer.module.css', '.drawer', true],
    ['ui/Card.module.css', '.card', false],
    ['ui/dev/Gallery.module.css', '.cream', true],
    ['games/common/ConfigRange.module.css', '.range', true],
    ['room/game-kit/PokemonSelector.module.css', '.tray', true],
  ])('%s %s compone la superficie crema', (file, selector, ink) => {
    const source = readFileSync(path.join(here, '..', file), 'utf8');
    const block = source.match(new RegExp(`(?:^|\\n)\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(block).toMatch(/composes:\s*cream from '[./]+(ui\/)?surfaces\.module\.css';/);
    expect(block).not.toMatch(/--focus-ring|--caret|color-scheme/);
    if (ink) expect(block).toMatch(/\bcolor:\s*var\(--ink\);/);
  });
  it('tinta y foco del crema ≥ 4,5:1 y ≥ 3:1', () => {
    expect(contrast(colors.ink, colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.navy, colors.cream)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.blueD, colors.cream)).toBeGreaterThanOrEqual(3);
  });
});

describe('escala tipográfica (§3.2)', () => {
  it('la escala de Tailwind es la de la spec', () => {
    // En `theme` (no en `extend`): sustituye la escala por defecto, así que `text-xs`, `text-sm`… ya no existen.
    expect(tailwind.theme.extend).not.toHaveProperty('fontSize');
    const sizes = tailwind.theme.fontSize as Record<string, [string, { lineHeight: string }]>;
    const claves = Object.keys(sizes).map(Number).sort((a, b) => a - b);
    expect(claves).toEqual([...fontSizes]);
    for (const n of fontSizes) expect(sizes[String(n)]![0]).toBe(`${n}px`);
  });
});

describe('capas (§2)', () => {
  function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? tsxFiles(p) : e.name.endsWith('.tsx') ? [p] : [];
    });
  }
  it('sin z-index literales', () => {
    expect(styles).not.toMatch(/z-index:\s*\d/);
    const root = path.join(here, '..');
    // Tampoco en los CSS Modules: el `z-index` va siempre por una capa `var(--z-*)`.
    const modulos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? modulos(p) : e.name.endsWith('.module.css') ? [p] : [];
    });
    const conLiteral = modulos(root).filter((f) => /z-index:\s*-?\d/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
    expect(conLiteral).toEqual([]);
    const permitidas = new Set(Object.keys(layers));
    // Clases `z-*` (con variantes y signo negativo) cuyo nombre no es una capa del sistema.
    const ilegales = (texto: string): string[] =>
      texto.split(/[\s"'`{}]+/).filter((t) => {
        const m = t.match(/^(?:[a-z0-9-]+:)*-?z-(.+)$/);
        return m !== null && !permitidas.has(m[1]!);
      });
    const malos = tsxFiles(root).filter((f) => ilegales(readFileSync(f, 'utf8')).length > 0).map((f) => path.relative(root, f));
    expect(malos).toEqual([]);
    const aplicadas = styles.split('\n').filter((l) => l.includes('@apply')).flatMap((l) => ilegales(l.replace(/^.*@apply/, '')));
    expect(aplicadas).toEqual([]);
  });
  it('sin zIndex inline salvo el contenido por isolate', () => {
    const root = path.join(here, '..');
    // DistanceRuler.tsx usa zIndex inline para apilar carriles; su `.lanes` (DistanceRuler.module.css) lleva `isolation: isolate`.
    const permitidos = new Set(['games/pokedex-distance/DistanceRuler.tsx']);
    const malos = tsxFiles(root).map((f) => path.relative(root, f).split(path.sep).join('/'))
      .filter((r) => !permitidos.has(r) && /zIndex\s*:/.test(readFileSync(path.join(root, r), 'utf8')));
    expect(malos).toEqual([]);
    expect(readFileSync(path.join(root, 'games/pokedex-distance/DistanceRuler.module.css'), 'utf8')).toMatch(/\.lanes\s*\{[^}]*isolation:\s*isolate/);
  });
  it('la escala de Tailwind son solo las capas', () => {
    expect(Object.keys((tailwind.theme as { zIndex?: Record<string, string> }).zIndex ?? {}).sort()).toEqual(Object.keys(layers).sort());
  });
});

describe('reducción de movimiento (§3.4)', () => {
  const root = path.join(here, '..');
  const hojas = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? hojas(p) : e.name.endsWith('.css') ? [p] : [];
  });
  /** Cuerpos de los bloques `@media (prefers-reduced-motion: reduce)` de una hoja (sin anidar más de un nivel). */
  const bloquesReduce = (texto: string): string[] =>
    [...texto.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]!);

  it('sin regla global con !important: los fundidos de 120 ms siguen vivos', () => {
    expect(bloquesReduce(styles).length).toBeGreaterThan(0);
    for (const bloque of bloquesReduce(styles)) expect(bloque).not.toContain('!important');
  });
  it('las clases motion-* se apagan con su propio reduce', () => {
    const apagadas = bloquesReduce(styles).join('\n');
    for (const clase of ['motion-bump', 'motion-enter-up', 'motion-enter-left', 'motion-enter-right']) {
      expect(apagadas, clase).toMatch(new RegExp(`\\.${clase}\\b[^{]*\\{[^}]*animation:\\s*none`));
    }
  });
  it('el fallo (motion-shake) queda en un fundido de 120 ms', () => {
    expect(bloquesReduce(styles).join('\n')).toMatch(/\.motion-shake\b[^{]*\{[^}]*animation:\s*motion-fade-in var\(--t-fade\)/);
  });
  it('--t-pop y --t-pulse bajan a 0 con reducción y con la clase static', () => {
    const reduce = bloquesReduce(css).join('\n');
    const stat = css.slice(css.indexOf('.static {'), css.indexOf('}', css.indexOf('.static {')));
    for (const token of ['--t-pop', '--t-pulse']) {
      expect(reduce, token).toContain(`${token}: 0ms;`);
      expect(stat, token).toContain(`${token}: 0ms;`);
    }
  });
  it('toda animación o transición con duración literal tiene su media query de movimiento', () => {
    // Las duraciones de los tokens ya bajan a 0 con reducción; una literal no, así que su hoja debe decidirlo.
    const literal = /(?:animation|transition)(?:-duration)?:([^;]*);/g;
    const sinCubrir = hojas(root).filter((f) => {
      const texto = readFileSync(f, 'utf8');
      const conLiteral = [...texto.matchAll(literal)].some((m) => /\b\d*\.?\d+m?s\b/.test(m[1]!.replace(/var\([^)]*\)/g, '')));
      return conLiteral && !texto.includes('prefers-reduced-motion');
    }).map((f) => path.relative(root, f));
    expect(sinCubrir).toEqual([]);
  });
});

describe('duraciones de los tokens ↔ temporizadores JS', () => {
  const ms = (name: string): number => {
    const m = rootBlock.match(new RegExp(`^\\s*${name}:\\s*(\\d+)ms;`, 'm'));
    if (!m) throw new Error(`token ${name} no encontrado en tokens.css`);
    return Number(m[1]);
  };
  it('el «+N» se desmonta cuando acaba su animación (--t-pop)', () => {
    expect(ms('--t-pop')).toBe(SCORE_POP_MS);
  });
  it('el cut-in dura lo que dice --t-cutin', () => {
    expect(ms('--t-cutin')).toBe(CUTIN_HOLD_MS);
  });
});
