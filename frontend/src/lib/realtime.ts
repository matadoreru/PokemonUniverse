import type { ClientToServerEvents, ServerToClientEvents } from '@pokemon-universe/shared/public';

export type CommandEvent = Exclude<keyof ClientToServerEvents, `who-is-who:${string}`>;
export type FireEvent = 'who-is-who:cursor' | 'who-is-who:cursor-clear';
export type CommandPayload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
export type CommandResponse<E extends CommandEvent> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];
export type CommandResult<E extends CommandEvent> = Extract<CommandResponse<E>, { ok: true }>;

export const OFFLINE_MESSAGE = 'Sin conexión con el servidor';
export const TIMEOUT_MESSAGE = 'No se pudo confirmar la acción. Comprueba el estado de la sala antes de reintentar.';
export const CONNECTION_LOST_MESSAGE = 'Conexión perdida: no se pudo confirmar la acción.';
export const COMMAND_TIMEOUT_MS = 8_000;

/** Realtime room channel (the Java `/ws` WebSocket, `realtime-ws.ts`); `RoomContext` depends only on this interface. */
export interface RealtimeClient {
  readonly connected: boolean;
  on<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void;
  off<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void;
  /** `(true)` on connect, `(false)` on disconnect and `(false, message)` on a connection error. Returns the unsubscribe function. */
  onConnection(listener: (connected: boolean, error?: string) => void): () => void;
  /** Acknowledged command with an 8 s timeout. A timeout means unknown outcome: commands are never replayed. */
  request<E extends CommandEvent>(event: E, payload: CommandPayload<E>): Promise<CommandResult<E>>;
  /** Fire-and-forget event without ack; dropped while offline. */
  fire<E extends FireEvent>(event: E, payload: CommandPayload<E>): void;
  /** Retry right away after a lost connection (skips the backoff wait); no-op while connecting, open or after `disconnect()`. */
  reconnect(): void;
  disconnect(): void;
}
