import type { ChatMessage } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { applyDeleted, applyHistory, applyMessage, EMPTY_CHAT, syncInstance } from './chat-state';

const msg = (seq: number): ChatMessage => ({ seq, authorId: 'u1', authorName: 'Ana', text: `m${seq}`, sentAt: 1000 + seq });
const seqs = (messages: ChatMessage[]) => messages.map((m) => m.seq);

describe('chat-state', () => {
  it('historyBeforeAckAndDuplicatesMerge', () => {
    let state = applyHistory(EMPTY_CHAT, { roomInstanceId: 'A', messages: [msg(1), msg(2)] });
    state = syncInstance(state, 'A');
    state = applyMessage(state, { roomInstanceId: 'A', message: msg(2) });
    state = applyMessage(state, { roomInstanceId: 'A', message: msg(3) });
    expect(seqs(state.messages)).toEqual([1, 2, 3]);
  });

  it('otherInstanceIsIgnored', () => {
    const state = applyHistory(EMPTY_CHAT, { roomInstanceId: 'A', messages: [msg(1)] });
    expect(applyHistory(state, { roomInstanceId: 'B', messages: [msg(9)] })).toBe(state);
    expect(applyMessage(state, { roomInstanceId: 'B', message: msg(9) })).toBe(state);
    expect(applyDeleted(state, { roomInstanceId: 'B', seq: 1 })).toBe(state);
  });

  it('capsAt50', () => {
    const messages = Array.from({ length: 60 }, (_, i) => msg(i + 1));
    const state = applyHistory(EMPTY_CHAT, { roomInstanceId: 'A', messages });
    expect(state.messages).toHaveLength(50);
    expect(state.messages[0]?.seq).toBe(11);
    const next = applyMessage(state, { roomInstanceId: 'A', message: msg(61) });
    expect(next.messages).toHaveLength(50);
    expect(next.messages[49]?.seq).toBe(61);
  });

  it('deletedRemoves', () => {
    const state = applyHistory(EMPTY_CHAT, { roomInstanceId: 'A', messages: [msg(1), msg(2)] });
    expect(seqs(applyDeleted(state, { roomInstanceId: 'A', seq: 1 }).messages)).toEqual([2]);
  });

  it('syncToNullEmpties', () => {
    const state = applyHistory(EMPTY_CHAT, { roomInstanceId: 'A', messages: [msg(1)] });
    expect(syncInstance(state, null)).toEqual(EMPTY_CHAT);
    expect(syncInstance(state, 'A')).toBe(state);
  });

  it('historyOfNewRoomAfterSyncIsKept', () => {
    const old = applyHistory(EMPTY_CHAT, { roomInstanceId: 'A', messages: [msg(1)] });
    const synced = syncInstance(old, 'B');
    expect(synced.messages).toEqual([]);
    expect(seqs(applyHistory(synced, { roomInstanceId: 'B', messages: [msg(5)] }).messages)).toEqual([5]);
    // Al revés: el historial de B llega con la sala ya fijada a B por el mismo manejador.
    const historyFirst = applyHistory(EMPTY_CHAT, { roomInstanceId: 'B', messages: [msg(5)] });
    expect(seqs(syncInstance(historyFirst, 'B').messages)).toEqual([5]);
  });

  it('phaseChangeKeepsChat', () => {
    const state = applyHistory(EMPTY_CHAT, { roomInstanceId: 'A', messages: [msg(1)] });
    const inGame = syncInstance(state, 'A');
    const backToLobby = syncInstance(inGame, 'A');
    expect(seqs(backToLobby.messages)).toEqual([1]);
  });
});
