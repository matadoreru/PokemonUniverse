/// <reference types="node" />
/**
 * Reglas locales de lint del sistema (F9, `eslint.config.mjs`): `arcade/no-arbitrary-style` y `arcade/no-raw-lucide`.
 * Se pasan por la configuración real con `ESLint#lintText`, así que también se prueba a qué archivos se aplican (por
 * ejemplo, que `ui/` puede pintar lucide). Solo cuentan los avisos de `arcade/*`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({ cwd: root });

async function arcade(code: string, file = 'frontend/src/screens/Prueba.tsx'): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? '').filter((id) => id.startsWith('arcade/'));
}

// La primera llamada carga la configuración y los plugins de ESLint, que tarda varios segundos cuando la suite corre
// en paralelo. Se hace aquí, con margen, para que cada caso solo mida su propio lint.
beforeAll(async () => {
  await arcade('export {};\n');
}, 60_000);

const conClase = (className: string): string => `export const A = () => <div className="${className}" />;\n`;

describe('arcade/no-arbitrary-style', () => {
  it.each([
    'text-[11px]', 'text-xs', 'md:text-sm', 'bg-[#fff]', 'z-[3]', 'text-ink/70', 'shadow-card',
    'shadow-[0_0_0_2px_#fff]', 'ring-[0_0_0_2px_rgba(0,0,0,0.5)]', 'hover:drop-shadow-[0_2px_0_hsl(0_0%_0%)]',
  ])('rechaza `%s`', async (clase) => {
    expect(await arcade(conClase(clase))).toContain('arcade/no-arbitrary-style');
  });

  it.each(['text-left', 'text-13', 'z-hud', 'border-[2.5px]', 'shadow-none', 'drop-shadow-[0_3px_0_var(--navy)]'])('admite `%s`', async (clase) => {
    expect(await arcade(conClase(clase))).toEqual([]);
  });

  it('también mira los literales de `cx(…)`', async () => {
    expect(await arcade("import { cx } from '../ui';\nexport const c = cx('flex', 'text-[11px]');\n")).toContain('arcade/no-arbitrary-style');
  });
});

describe('arcade/no-raw-lucide', () => {
  it('rechaza un icono de lucide como JSX directo, con nombre o por espacio de nombres', async () => {
    expect(await arcade("import { Search } from 'lucide-react';\nexport const A = () => <Search />;\n")).toEqual(['arcade/no-raw-lucide']);
    expect(await arcade("import * as L from 'lucide-react';\nexport const A = () => <L.Search />;\n")).toEqual(['arcade/no-raw-lucide']);
  });

  it('admite pasar el icono por la prop `icon`', async () => {
    expect(await arcade("import { Search } from 'lucide-react';\nimport { Pill } from '../ui';\nexport const A = () => <Pill icon={Search} />;\n")).toEqual([]);
  });

  it('no se aplica dentro de `ui/` (lo pinta `Icon`)', async () => {
    expect(await arcade("import { Search } from 'lucide-react';\nexport const A = () => <Search />;\n", 'frontend/src/ui/Prueba.tsx')).toEqual([]);
  });
});
