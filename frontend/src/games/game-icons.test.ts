import { describe, expect, it } from 'vitest';
import { Gamepad2 } from 'lucide-react';
import { clientGameRegistry } from './registry';
import { GAME_ICONS, gameIcon } from './game-icons';

describe('iconos de los minijuegos', () => {
  it('cada juego del registro tiene su icono de línea propio', () => {
    const ids = clientGameRegistry.list().map((game) => game.id);
    for (const id of ids) expect(GAME_ICONS[id], id).toBeDefined();
    // Sin repetir: cada juego se distingue por su icono.
    const used = ids.map((id) => GAME_ICONS[id]);
    expect(new Set(used).size).toBe(used.length);
  });

  it('un juego desconocido usa el mando genérico', () => {
    expect(gameIcon('juego-nuevo')).toBe(Gamepad2);
  });
});
