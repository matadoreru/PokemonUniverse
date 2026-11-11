import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RevealNextControl, revealNextLabel } from './RevealNextControl';

const roomState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('./RoomContext', () => ({ useRoom: () => roomState.value }));
const { GameSkipSlot } = await import('./game-kit/GameSkipSlot');

const reveal = { playerIds: ['ash', 'misty'], readyPlayerIds: ['misty'] };
const render = (selfId: string | null, connected = true) => renderToStaticMarkup(<RevealNextControl reveal={reveal} selfId={selfId} connected={connected} onNext={async () => undefined} />);
const skipState = { gameInstanceId: '00000000-0000-4000-8000-000000000001', voterIds: [], votes: 0, requiredVotes: 2, currentUserVoted: false, canVote: true };

describe('«Siguiente» en los revelados', () => {
  it('jugador sin pulsar: botón activo con el recuento N/M', () => {
    const html = render('ash');
    expect(html).toContain('Siguiente');
    expect(html).toContain('1/2');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Pasar al siguiente: 1 de 2 listos"');
  });

  it('ya pulsado: queda marcado y no se puede repetir; sin conexión tampoco se pulsa', () => {
    const html = render('misty');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('disabled=""');
    expect(revealNextLabel(reveal, true)).toBe('Esperando al resto para pasar al siguiente: 1 de 2 listos');
    expect(render('ash', false)).toContain('disabled=""');
  });

  it('los espectadores (y sin sesión) no lo ven, y no lleva región viva propia', () => {
    expect(render('gary')).toBe('');
    expect(render(null)).toBe('');
    expect(render('ash')).not.toMatch(/aria-live|role="status"/);
  });

  it('el hueco de la pantalla lo pinta en el revelado, también en el reto diario (sin «Saltar minijuego»)', () => {
    roomState.value = { room: { gameSkipState: skipState, revealSkip: reveal, gameActionEpoch: '["ROUND_RESULTS",1]', daily: { gameId: 'higher-lower' } }, selfId: 'ash', connected: true, setGameSkipVote: async () => undefined, revealNext: async () => undefined };
    const daily = renderToStaticMarkup(<GameSkipSlot />);
    expect(daily).toContain('data-testid="reveal-next"');
    expect(daily).not.toContain('Saltar minijuego');
    roomState.value = { ...roomState.value, room: { gameSkipState: skipState, revealSkip: null, gameActionEpoch: '["ROUND_ACTIVE",1]', daily: null } };
    const active = renderToStaticMarkup(<GameSkipSlot />);
    expect(active).not.toContain('data-testid="reveal-next"');
    expect(active).toContain('Saltar minijuego');
  });
});
