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
  it('el triplete --type-<t>-rgb coincide con el hex', () => {
    for (const t of tipos) {
      const h = typeColors[t];
      const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
      expect(rootBlock, t).toContain(`--type-${t}-rgb: ${rgb};`);
    }
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
    // Rellenos `bg-aqua`/`bg-berry` dentro de `.on-cream` (alias de migración): tinta blanca.
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

describe('insignias de tipo', () => {
  it('tipos con tinta blanca llevan anillo', () => {
    const blancos = tipos.filter((t) => typeInk[t] === colors.white);
    expect(blancos).toHaveLength(5);
    for (const t of blancos) {
      const regla = styles.match(new RegExp(`\\.type-badge-${t}\\s*\\{([^}]*)\\}`));
      expect(regla, `.type-badge-${t}`).not.toBeNull();
      expect(regla![1], t).toMatch(/box-shadow:\s*0 0 0 2px var\(--white\)/);
    }
  });
});

describe('alias de Tailwind (§11)', () => {
  it('--color-berry es el triplete de --red-l', () => {
    const rgb = [1, 3, 5].map((i) => parseInt(colors.redL.slice(i, i + 2), 16)).join(' ');
    expect(styles).toMatch(new RegExp(`--color-berry:\\s*${rgb};`));
  });
  it.each([
    ['navy-2', colors.navy2],
    ['navy', colors.navy],
    ['navy-3', colors.navy3],
  ])('red-l sobre %s ≥ 4,5:1 (texto berry)', (_n, bg) => {
    expect(contrast(colors.redL, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('blanco sobre red-text ≥ 4,5:1 (botón principal)', () => {
    expect(contrast(colors.white, colors.redText)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('.on-cream (§11): los alias vuelven a la tinta oscura dentro del crema', () => {
  const block = styles.match(/\n\.on-cream\s*\{([^}]*)\}/)?.[1] ?? '';
  const triplet = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
  /** Color del alias en `.on-cream` como `#RRGGBB`. */
  function alias(name: string): string {
    const m = block.match(new RegExp(`--color-${name}:\\s*(\\d+) (\\d+) (\\d+);`));
    if (!m) throw new Error(`--color-${name} no está en .on-cream`);
    return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  it('reasigna ink, surface, surface-raised, berry y aqua a tokens del sistema', () => {
    expect(block).toMatch(new RegExp(`--color-ink:\\s*${triplet(colors.ink)};`));
    expect(block).toMatch(new RegExp(`--color-surface:\\s*${triplet(colors.cream)};`));
    expect(block).toMatch(new RegExp(`--color-surface-raised:\\s*${triplet(colors.cream2)};`));
    expect(block).toMatch(new RegExp(`--color-berry:\\s*${triplet(colors.redD)};`));
    expect(block).toMatch(new RegExp(`--color-aqua:\\s*${triplet(colors.blueD)};`));
  });
  it('anillo de foco azul noche, también sobre amarillo', () => {
    expect(block).toMatch(/--focus-ring:\s*var\(--navy\);/);
    expect(block).toMatch(/--focus-ring-on-yellow:\s*var\(--navy\);/);
    expect(contrast(colors.navy, colors.cream)).toBeGreaterThanOrEqual(3);
  });
  it.each([
    ['ink/70 sobre surface', () => contrast(mix(alias('ink'), alias('surface'), 0.7), alias('surface'))],
    ['ink/70 sobre surface-raised', () => contrast(mix(alias('ink'), alias('surface-raised'), 0.7), alias('surface-raised'))],
    ['ink sobre surface-raised (.btn-ghost, .field)', () => contrast(alias('ink'), alias('surface-raised'))],
    ['berry sobre berry/10 (.status-error)', () => contrast(alias('berry'), mix(alias('berry'), alias('surface'), 0.1))],
    ['berry sobre berry/15 (tono berry de «Cómo se juega»)', () => contrast(alias('berry'), mix(alias('berry'), alias('surface'), 0.15))],
    ['aqua sobre aqua/5', () => contrast(alias('aqua'), mix(alias('aqua'), alias('surface'), 0.05))],
  ])('%s ≥ 4,5:1', (_n, ratio) => {
    expect(ratio()).toBeGreaterThanOrEqual(4.5);
  });
});

describe('escala tipográfica (§3.2)', () => {
  it('la escala de Tailwind es la de la spec', () => {
    const sizes = (tailwind.theme.extend.fontSize ?? {}) as Record<string, [string, { lineHeight: string }]>;
    const claves = Object.keys(sizes).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
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
    // DistanceRuler.tsx usa zIndex inline para apilar carriles; `.distance-ruler-lanes` lleva `isolation: isolate`.
    const permitidos = new Set(['room/DistanceRuler.tsx']);
    const malos = tsxFiles(root).map((f) => path.relative(root, f).split(path.sep).join('/'))
      .filter((r) => !permitidos.has(r) && /zIndex\s*:/.test(readFileSync(path.join(root, r), 'utf8')));
    expect(malos).toEqual([]);
    expect(styles).toMatch(/\.distance-ruler-lanes\s*\{[^}]*isolation:\s*isolate/);
  });
  it('la escala de Tailwind son solo las capas', () => {
    expect(Object.keys((tailwind.theme as { zIndex?: Record<string, string> }).zIndex ?? {}).sort()).toEqual(Object.keys(layers).sort());
  });
});
