import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { claimTurnCue, roomTurnKey, TURN_CUE_TITLE, TurnCutin, turnBumpClass, turnCueFires, type TurnCueStore } from './useTurnCue';

function memoryStore(initial: string | null = null): TurnCueStore & { value: string | null } {
  const store = { value: initial, read: () => store.value, write: (key: string) => { store.value = key; } };
  return store;
}

const room = { code: 'ABCD', gameSkipState: { gameInstanceId: 'g1', voterIds: [], votes: 0, requiredVotes: 2, currentUserVoted: false, canVote: true } };

describe('«¡Te toca!»', () => {
  it('la clave lleva la sala, la partida y el turno; sin turno, nada', () => {
    expect(roomTurnKey(room, '2:p1')).toBe('ABCD:g1:2:p1');
    expect(roomTurnKey({ ...room, gameSkipState: { ...room.gameSkipState, gameInstanceId: 'g2' } }, '2:p1')).not.toBe(roomTurnKey(room, '2:p1'));
    expect(roomTurnKey(room, null)).toBeNull();
    expect(roomTurnKey({ code: 'ABCD', gameSkipState: null }, 3)).toBe('ABCD::3');
  });

  it('solo en tu turno, con clave y si no es la del último turno anunciado', () => {
    expect(turnCueFires(true, 'k1', null)).toBe(true);
    expect(turnCueFires(false, 'k1', null)).toBe(false);
    expect(turnCueFires(true, null, null)).toBe(false);
    expect(turnCueFires(true, 'k1', 'k1')).toBe(false);
    expect(turnCueFires(true, 'k2', 'k1')).toBe(true);
  });

  it('el primer turno se anuncia al montar; al volver a montar en el mismo turno (recarga, reconexión), no; uno nuevo, sí', () => {
    const store = memoryStore();
    // La pantalla monta tras la intro con tu turno ya empezado: sale.
    expect(claimTurnCue(store, true, 'ABCD:g1:1')).toBe(true);
    // Otro montaje (o un render más) en ese mismo turno: ya se vio.
    expect(claimTurnCue(store, true, 'ABCD:g1:1')).toBe(false);
    // El turno de otro no cuenta ni borra lo visto.
    expect(claimTurnCue(store, false, 'ABCD:g1:2')).toBe(false);
    expect(store.value).toBe('ABCD:g1:1');
    // Tu siguiente turno sí.
    expect(claimTurnCue(store, true, 'ABCD:g1:3')).toBe(true);
    expect(store.value).toBe('ABCD:g1:3');
  });

  it('el cut-in no es región viva, se puede saltar y sale solo con clave; el rebote, igual', () => {
    const html = renderToStaticMarkup(<TurnCutin cue="ABCD:g1:1" />);
    expect(html).toContain(TURN_CUE_TITLE);
    expect(html).not.toMatch(/role="status"|aria-live/);
    expect(html).toMatch(/class="[^"]*skippable/);
    expect(renderToStaticMarkup(<TurnCutin cue={null} />)).toBe('');
    expect(turnBumpClass('k')).toBeTruthy();
    expect(turnBumpClass(null)).toBeUndefined();
  });
});
