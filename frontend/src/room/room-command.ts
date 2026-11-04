/** Aviso global de errores de la sala (el que pinta `RoomSessionLayout`). */
export interface RoomErrorReporter {
  clear(): void;
  set(message: string): void;
}

/**
 * Lanza un comando de sala. Con `report`, limpia el aviso global al empezar y publica en él el fallo; con `null`, el
 * aviso global no se toca: quien llama enseña el error donde toca (Jugar lo pone en su campo, traducido) y así no borra
 * ni pisa avisos ajenos (conexión perdida, expulsión…). En los dos casos el error se relanza.
 */
export async function requestCommand<T>(request: () => Promise<T>, report: RoomErrorReporter | null): Promise<T> {
  report?.clear();
  try {
    return await request();
  } catch (error) {
    report?.set(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** Lo mínimo del cliente en tiempo real que necesita `commandRequest`. */
export interface CommandSocket<E, P, T> {
  request(event: E, payload: P): Promise<T>;
}

/**
 * La petición de un comando, para `requestCommand`. Las guardas van DENTRO de ella (sin conexión, sin minijuego activo,
 * sin época de acción): así sus fallos también pasan por el aviso global y no se pierden en silencio. `payload` puede ser
 * una función que lance si falta algo (ver `gameActionPayload`).
 */
export function commandRequest<E, P, T>(socket: CommandSocket<E, P, T> | null, event: E, payload: P | (() => P)): () => Promise<T> {
  return async () => {
    if (!socket) throw new Error('Sin conexión con el servidor');
    const body = typeof payload === 'function' ? (payload as () => P)() : payload;
    return socket.request(event, body);
  };
}

/** Datos de `game:action`: el minijuego activo y la época de acción de la sala; si falta alguno, un error en castellano. */
export function gameActionPayload<A>(room: { gameSkipState?: { gameInstanceId: string } | null; gameActionEpoch?: string | null } | null, action: A): { gameInstanceId: string; actionEpoch: string; action: A } {
  const gameInstanceId = room?.gameSkipState?.gameInstanceId;
  if (!gameInstanceId) throw new Error('No hay un minijuego activo.');
  const actionEpoch = room?.gameActionEpoch;
  if (!actionEpoch) throw new Error('Actualiza la conexión para recuperar la ronda.');
  return { gameInstanceId, actionEpoch, action };
}
