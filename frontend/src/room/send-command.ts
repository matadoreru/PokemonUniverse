import {
  COMMAND_TIMEOUT_MS, CONNECTION_LOST_MESSAGE, OFFLINE_MESSAGE, TIMEOUT_MESSAGE,
  type CommandEvent, type CommandPayload, type CommandResponse, type CommandResult,
} from '../lib/realtime';
import type { GameSocket } from '../lib/socket';

export type { CommandEvent, CommandPayload, CommandResult } from '../lib/realtime';

/** Socket.IO ack helper behind `SocketIoRealtime.request`. Timeout means unknown outcome: commands are never automatically replayed. */
export function sendCommand<E extends CommandEvent>(socket: GameSocket, event: E, payload: CommandPayload<E>): Promise<CommandResult<E>> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) { reject(new Error(OFFLINE_MESSAGE)); return; }
    let settled = false;
    const finish = (error: Error | null, response?: CommandResponse<E>) => {
      if (settled) return;
      settled = true;
      socket.off('disconnect', disconnected);
      if (error) { reject(error); return; }
      if (!response) { reject(new Error(TIMEOUT_MESSAGE)); return; }
      if (!response.ok) { reject(new Error(response.error)); return; }
      resolve(response as CommandResult<E>);
    };
    const disconnected = () => finish(new Error(CONNECTION_LOST_MESSAGE));
    socket.once('disconnect', disconnected);
    // Socket.IO's timeout decorator adds an error argument to the shared ACK contract.
    const emit = socket.timeout(COMMAND_TIMEOUT_MS).emit as unknown as (event: E, payload: CommandPayload<E>, ack: (error: Error | null, response?: CommandResponse<E>) => void) => void;
    try {
      emit.call(socket, event, payload, (error, response) => finish(error ? new Error(TIMEOUT_MESSAGE) : null, response));
    } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
