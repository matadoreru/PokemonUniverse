import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultTypeDuelConfig } from '@pokemon-universe/shared/public';
import { TypeDuelConfigPanel } from '../games/type-duel/ConfigPanel';
import { GameModeField, SessionModesProvider, toggleAllowedMode } from './GameModeField';
import { labelledRadiogroup } from '../ui/segmented-markup';

const render = (gameId: string, value: string | undefined) =>
  renderToStaticMarkup(<GameModeField gameId={gameId} value={value} onChange={() => undefined} disabled={false} />);

describe('GameModeField', () => {
  it('muestra Clásico y el modo nuevo, con el texto del modo elegido', () => {
    const html = render('pokedex-distance', 'POINTS');
    expect(html).toMatch(labelledRadiogroup('Modo'));
    expect(html).toMatch(/aria-checked="false"[^>]*>Clásico</);
    expect(html).toMatch(/aria-checked="true"[^>]*>Por puntos</);
    const hintId = /<p id="([^"]+)"[^>]*>Nadie queda fuera: cada ronda suma 100 menos tu distancia, y 50 extra si clavas el número\.<\/p>/.exec(html)?.[1];
    expect(hintId).toBeTruthy();
    expect(html).toContain(`aria-describedby="${hintId}"`);
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

  it('en la sesión pinta casillas «Modos que se juegan» y bloquea el último marcado', () => {
    const html = renderToStaticMarkup(<SessionModesProvider value={{ gameId: 'higher-lower', allowed: ['ENDLESS'], order: false, onChange: () => undefined }}>
      <GameModeField gameId="higher-lower" value="CLASSIC" onChange={() => undefined} disabled={false} />
    </SessionModesProvider>);
    expect(html).toContain('Modos que se juegan');
    expect(html).toContain('Cada modo marcado es una opción más al azar y en la votación');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toMatch(/aria-pressed="false"[^>]*>(?:(?!<\/button>).)*Clásico/);
    expect(html).toMatch(/aria-pressed="true"[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Racha infinita/);
    expect(html).toContain('Un fallo y estás fuera.');
  });

  it('por orden explica que cada modo marcado ocupa su turno en la cola', () => {
    const html = renderToStaticMarkup(<SessionModesProvider value={{ gameId: 'higher-lower', allowed: ['CLASSIC', 'ENDLESS'], order: true, onChange: () => undefined }}>
      <GameModeField gameId="higher-lower" value="CLASSIC" onChange={() => undefined} disabled={false} />
    </SessionModesProvider>);
    expect(html).toContain('Modos que se juegan');
    expect(html).toContain('Cada modo marcado ocupa su propio turno en la cola, seguidos y en este orden');
    expect(html).not.toContain('al azar y en la votación');
  });

  it('con el contexto de otro juego sigue siendo el Segmented', () => {
    const html = renderToStaticMarkup(<SessionModesProvider value={{ gameId: 'type-duel', allowed: ['CLASSIC', 'COOP'], order: false, onChange: () => undefined }}>
      <GameModeField gameId="higher-lower" value="CLASSIC" onChange={() => undefined} disabled={false} />
    </SessionModesProvider>);
    expect(html).toMatch(labelledRadiogroup('Modo'));
  });

  it('toggleAllowedMode marca y desmarca en el orden del catálogo, nunca hasta vaciar', () => {
    const modes = ['CLASSIC', 'ENDLESS'] as const;
    expect(toggleAllowedMode(modes, ['ENDLESS'], 'CLASSIC')).toEqual(['CLASSIC', 'ENDLESS']);
    expect(toggleAllowedMode(modes, ['CLASSIC', 'ENDLESS'], 'CLASSIC')).toEqual(['ENDLESS']);
    expect(toggleAllowedMode(modes, ['CLASSIC'], 'CLASSIC')).toBeNull();
  });

  it('los ajustes propios de un modo se ven si ese modo está marcado', () => {
    const panel = (allowed: string[] | null) => renderToStaticMarkup(<SessionModesProvider value={allowed ? { gameId: 'type-duel', allowed, order: false, onChange: () => undefined } : null}>
      <TypeDuelConfigPanel config={defaultTypeDuelConfig} disabled={false} onChange={async () => undefined} />
    </SessionModesProvider>);
    const both = panel(['CLASSIC', 'COOP']);
    expect(both).toContain('Tiempo para buscar');
    expect(both).toContain('Tiempo de búsqueda conjunta');
    expect(panel(['COOP'])).not.toContain('Tiempo para buscar');
    expect(panel(null)).not.toContain('Tiempo de búsqueda conjunta');
  });
});
