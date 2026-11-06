import type { ChatMessage } from '@pokemon-universe/shared/public';

/** Mensajes que guarda el cliente por sala (los mismos que devuelve el historial del servidor). */
const CHAT_CLIENT_LIMIT = 50;

export interface ChatState {
  roomInstanceId: string | null;
  messages: ChatMessage[];
}

export const EMPTY_CHAT: ChatState = { roomInstanceId: null, messages: [] };

/**
 * Fija la instancia de sala que manda: si cambia, vacía el chat; si no, devuelve el mismo estado.
 * Se llama en los mismos manejadores que fijan la sala, nunca desde un efecto.
 */
export function syncInstance(state: ChatState, roomInstanceId: string | null): ChatState {
  if (state.roomInstanceId === roomInstanceId) return state;
  return roomInstanceId === null ? EMPTY_CHAT : { roomInstanceId, messages: [] };
}

/** Une por `seq` (gana el último que llega), ordena y se queda con los mayores. */
function merge(state: ChatState, roomInstanceId: string, incoming: ChatMessage[]): ChatState {
  if (state.roomInstanceId !== null && state.roomInstanceId !== roomInstanceId) return state;
  const bySeq = new Map<number, ChatMessage>();
  for (const message of state.messages) bySeq.set(message.seq, message);
  for (const message of incoming) bySeq.set(message.seq, message);
  const messages = [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-CHAT_CLIENT_LIMIT);
  return { roomInstanceId, messages };
}

export function applyHistory(state: ChatState, payload: { roomInstanceId: string; messages: ChatMessage[] }): ChatState {
  return merge(state, payload.roomInstanceId, payload.messages);
}

export function applyMessage(state: ChatState, payload: { roomInstanceId: string; message: ChatMessage }): ChatState {
  return merge(state, payload.roomInstanceId, [payload.message]);
}

export function applyDeleted(state: ChatState, payload: { roomInstanceId: string; seq: number }): ChatState {
  if (state.roomInstanceId !== payload.roomInstanceId) return state;
  if (!state.messages.some((message) => message.seq === payload.seq)) return state;
  return { ...state, messages: state.messages.filter((message) => message.seq !== payload.seq) };
}
