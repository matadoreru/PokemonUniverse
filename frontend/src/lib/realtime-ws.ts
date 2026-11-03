import type { ServerToClientEvents } from '@pokemon-universe/shared/public';
import {
  COMMAND_TIMEOUT_MS, CONNECTION_LOST_MESSAGE, OFFLINE_MESSAGE, TIMEOUT_MESSAGE,
  type CommandEvent, type CommandPayload, type CommandResult, type FireEvent, type RealtimeClient,
} from './realtime';

type AnyListener = (...args: unknown[]) => void;
type ConnectionListener = (connected: boolean, error?: string) => void;
interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
interface AckFrame { id: string; ok: boolean; data?: Record<string, unknown>; error?: string }
interface PushFrame { event: string; payload?: unknown }

const AUTH_CLOSE_CODE = 4401;
const AUTH_MESSAGE = 'Authentication required';
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 8_000;

function isAck(frame: unknown): frame is AckFrame {
  return typeof frame === 'object' && frame !== null && typeof (frame as AckFrame).id === 'string' && typeof (frame as AckFrame).ok === 'boolean';
}
function isPush(frame: unknown): frame is PushFrame {
  return typeof frame === 'object' && frame !== null && typeof (frame as PushFrame).event === 'string';
}

/** Native WebSocket client for the Java `/ws` endpoint: `{id, event, payload}` envelopes, acks by id and server pushes by event. */
export class WebSocketRealtime implements RealtimeClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private nextId = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Map<string, Set<AnyListener>>();
  private readonly connectionListeners = new Set<ConnectionListener>();

  constructor(private readonly url: string, private readonly WebSocketImpl: typeof WebSocket = globalThis.WebSocket) { this.connect(); }

  get connected(): boolean { return this.socket?.readyState === this.WebSocketImpl.OPEN; }

  on<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(listener as AnyListener);
  }

  off<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void { this.listeners.get(event)?.delete(listener as AnyListener); }

  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => { this.connectionListeners.delete(listener); };
  }

  request<E extends CommandEvent>(event: E, payload: CommandPayload<E>): Promise<CommandResult<E>> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket || !this.connected) { reject(new Error(OFFLINE_MESSAGE)); return; }
      const id = String(++this.nextId);
      const timer = setTimeout(() => { if (this.pending.delete(id)) reject(new Error(TIMEOUT_MESSAGE)); }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try { socket.send(JSON.stringify({ id, event, payload })); }
      catch (error) { this.settle(id)?.reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  fire<E extends FireEvent>(event: E, payload: CommandPayload<E>): void {
    if (!this.socket || !this.connected) return;
    try { this.socket.send(JSON.stringify({ event, payload })); } catch { /* fire-and-forget */ }
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.rejectPending();
    this.socket?.close(1000);
  }

  private connect(): void {
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.notify(true);
    };
    socket.onmessage = (message: MessageEvent) => { if (this.socket === socket) this.handleFrame(message.data); };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.rejectPending();
      const auth = event.code === AUTH_CLOSE_CODE;
      this.notify(false, auth ? AUTH_MESSAGE : undefined);
      if (auth) this.stopped = true;
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(BACKOFF_INITIAL_MS * 2 ** this.attempt, BACKOFF_MAX_MS);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; if (!this.stopped) this.connect(); }, delay);
  }

  private handleFrame(data: unknown): void {
    let frame: unknown;
    try { frame = JSON.parse(String(data)); } catch { return; }
    if (isAck(frame)) {
      const pending = this.settle(frame.id);
      if (!pending) return;
      if (frame.ok) pending.resolve({ ...frame.data, ok: true });
      else pending.reject(new Error(frame.error ?? TIMEOUT_MESSAGE));
      return;
    }
    if (isPush(frame)) this.listeners.get(frame.event)?.forEach((listener) => listener(frame.payload));
  }

  private settle(id: string): Pending | undefined {
    const pending = this.pending.get(id);
    if (!pending) return undefined;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    return pending;
  }

  private rejectPending(): void {
    for (const id of [...this.pending.keys()]) this.settle(id)?.reject(new Error(CONNECTION_LOST_MESSAGE));
  }

  private notify(connected: boolean, error?: string): void {
    this.connectionListeners.forEach((listener) => { if (error === undefined) listener(connected); else listener(connected, error); });
  }
}
