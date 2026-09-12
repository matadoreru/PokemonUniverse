import type { ClientToServerEvents } from '@pokemon-universe/shared/public';
import type { GameSocket } from '../lib/socket';

export type CommandEvent = Exclude<keyof ClientToServerEvents, `who-is-who:${string}`>;
export type CommandPayload<E extends CommandEvent> = Parameters<ClientToServerEvents[E]>[0];
type Response<E extends CommandEvent> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];
export type CommandResult<E extends CommandEvent> = Extract<Response<E>, { ok: true }>;

/** Timeout means unknown outcome: commands are never automatically replayed. */
export function sendCommand<E extends CommandEvent>(socket: GameSocket, event: E, payload: CommandPayload<E>): Promise<CommandResult<E>> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) { reject(new Error('Sin conexión con el servidor')); return; }
    let settled = false;
    const finish = (error: Error | null, response?: Response<E>) => {
      if (settled) return;
      settled = true;
      socket.off('disconnect', disconnected);
      if (error) { reject(error); return; }
      if (!response) { reject(new Error('No se pudo confirmar la acción. Comprueba el estado de la sala antes de reintentar.')); return; }
      if (!response.ok) { reject(new Error(response.error)); return; }
      resolve(response as CommandResult<E>);
    };
    const disconnected = () => finish(new Error('Conexión perdida: no se pudo confirmar la acción.'));
    socket.once('disconnect', disconnected);
    // Socket.IO's timeout decorator adds an error argument to the shared ACK contract.
    const emit = socket.timeout(8_000).emit as unknown as (event: E, payload: CommandPayload<E>, ack: (error: Error | null, response?: Response<E>) => void) => void;
    try {
      emit.call(socket, event, payload, (error, response) => finish(error ? new Error('No se pudo confirmar la acción. Comprueba el estado de la sala antes de reintentar.') : null, response));
    } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
