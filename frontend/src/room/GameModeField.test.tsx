import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultTypeDuelConfig } from '@pokemon-universe/shared/public';
import { TypeDuelConfigPanel } from '../games/type-duel/ConfigPanel';
import { GameModeField, SessionModesProvider, toggleAllowedMode } from './GameModeField';

const render = (gameId: string, value: string | undefined) =>
  renderToStaticMarkup(<GameModeField gameId={gameId} value={value} onChange={() => undefined} disabled={false} />);

describe('GameModeField', () => {
  it('muestra Clásico y el modo nuevo, con el texto del modo elegido', () => {
    const html = render('pokedex-distance', 'POINTS');
    expect(html).toContain('role="radiogroup" aria-label="Modo"');
    expect(html).toMatch(/aria-checked="false"[^>]*>Clásico</);
    expect(html).toMatch(/aria-checked="true"[^>]*>Por puntos</);
    expect(html).toContain('Nadie queda fuera: cada ronda suma 100 menos tu distancia, y 50 extra si clavas el número.');
  });

  it('en Clásico (o sin mode guardado) marca Clásico y no enseña el texto del modo nuevo', () => {
    for (const value of ['CLASSIC', undefined]) {
      const html = render('type-duel', value);
      expect(html).toMatch(/aria-checked="true"[^>]*>Clásico</);
      expect(html).toContain('>Cooperativo<');
      expect(html).not.toContain('Todos contra el reloj');
    }
  });

  it('no pinta nada en un juego sin modos', () => {
    expect(render('pokemon-bingo', 'CLASSIC')).toBe('');
  });

  it('al azar o por votación pinta casillas «Modos que pueden salir» y bloquea el último marcado', () => {
    const html = renderToStaticMarkup(<SessionModesProvider value={{ gameId: 'higher-lower', allowed: ['ENDLESS'], onChange: () => undefined }}>
      <GameModeField gameId="higher-lower" value="CLASSIC" onChange={() => undefined} disabled={false} />
    </SessionModesProvider>);
    expect(html).toContain('Modos que pueden salir');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toMatch(/aria-pressed="false"[^>]*>(?:(?!<\/button>).)*Clásico/);
    expect(html).toMatch(/aria-pressed="true"[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Racha infinita/);
    expect(html).toContain('Un fallo y estás fuera.');
  });

  it('con el contexto de otro juego sigue siendo el Segmented', () => {
    const html = renderToStaticMarkup(<SessionModesProvider value={{ gameId: 'type-duel', allowed: ['CLASSIC', 'COOP'], onChange: () => undefined }}>
      <GameModeField gameId="higher-lower" value="CLASSIC" onChange={() => undefined} disabled={false} />
    </SessionModesProvider>);
    expect(html).toContain('role="radiogroup" aria-label="Modo"');
  });

  it('toggleAllowedMode marca y desmarca en el orden del catálogo, nunca hasta vaciar', () => {
    const modes = ['CLASSIC', 'ENDLESS'] as const;
    expect(toggleAllowedMode(modes, ['ENDLESS'], 'CLASSIC')).toEqual(['CLASSIC', 'ENDLESS']);
    expect(toggleAllowedMode(modes, ['CLASSIC', 'ENDLESS'], 'CLASSIC')).toEqual(['ENDLESS']);
    expect(toggleAllowedMode(modes, ['CLASSIC'], 'CLASSIC')).toBeNull();
  });

  it('los ajustes propios de un modo se ven si ese modo está marcado', () => {
    const panel = (allowed: string[] | null) => renderToStaticMarkup(<SessionModesProvider value={allowed ? { gameId: 'type-duel', allowed, onChange: () => undefined } : null}>
      <TypeDuelConfigPanel config={defaultTypeDuelConfig} disabled={false} onChange={async () => undefined} />
    </SessionModesProvider>);
    const both = panel(['CLASSIC', 'COOP']);
    expect(both).toContain('Tiempo para buscar');
    expect(both).toContain('Tiempo de búsqueda conjunta');
    expect(panel(['COOP'])).not.toContain('Tiempo para buscar');
    expect(panel(null)).not.toContain('Tiempo de búsqueda conjunta');
  });
});
