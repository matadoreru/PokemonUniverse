import type { ServerToClientEvents } from '@pokemon-universe/shared/public';
import { sendCommand } from '../room/send-command';
import type { CommandEvent, CommandPayload, CommandResult, FireEvent, RealtimeClient } from './realtime';
import type { GameSocket } from './socket';

type AnyListener = (...args: unknown[]) => void;

export class SocketIoRealtime implements RealtimeClient {
  constructor(private readonly socket: GameSocket) {}

  get connected(): boolean { return this.socket.connected; }

  on<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void {
    (this.socket.on as unknown as (event: E, listener: AnyListener) => void).call(this.socket, event, listener as AnyListener);
  }

  off<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void {
    (this.socket.off as unknown as (event: E, listener: AnyListener) => void).call(this.socket, event, listener as AnyListener);
  }

  onConnection(listener: (connected: boolean, error?: string) => void): () => void {
    const connect = () => listener(true);
    const disconnect = () => listener(false);
    const connectError = (error: Error) => listener(false, error.message);
    this.socket.on('connect', connect);
    this.socket.on('disconnect', disconnect);
    this.socket.on('connect_error', connectError);
    return () => { this.socket.off('connect', connect); this.socket.off('disconnect', disconnect); this.socket.off('connect_error', connectError); };
  }

  request<E extends CommandEvent>(event: E, payload: CommandPayload<E>): Promise<CommandResult<E>> { return sendCommand(this.socket, event, payload); }

  fire<E extends FireEvent>(event: E, payload: CommandPayload<E>): void {
    (this.socket.emit as unknown as (event: E, payload: CommandPayload<E>) => void).call(this.socket, event, payload);
  }

  disconnect(): void { this.socket.disconnect(); }
}
