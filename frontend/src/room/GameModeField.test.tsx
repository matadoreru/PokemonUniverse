import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameModeField } from './GameModeField';

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
});
