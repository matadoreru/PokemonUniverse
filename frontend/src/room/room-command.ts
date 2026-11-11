import type { RoomView } from '@pokemon-universe/shared/public';

/** Aviso global de errores de la sala (el que pinta `RoomSessionLayout`). */
export interface RoomErrorReporter {
  clear(): void;
  set(message: string): void;
}

/** Opciones de `gameAction`. `report: false`: ni limpia ni publica el aviso global (borradores que se envían a cada pulsación). */
export interface GameActionOptions { report?: boolean }

/** La orden de juego que reciben las pantallas (`gameAction` de la sala). */
export type GameAction = (action: unknown, options?: GameActionOptions) => Promise<void>;

/** Props de la pantalla de un minijuego en curso (`ActiveGame` del registro). */
export interface ActiveGameProps { room: RoomView; selfId: string; onAction: GameAction }

/** Props de los resultados de un minijuego (`Results` del registro). */
export interface GameResultsProps { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }

/** Para `.catch`: el fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext) y aquí no se repite. */
export const ignoreFailure = () => undefined;

/**
 * Envío con estado de ocupado, sin React (para probarlo): lo marca, espera la orden y lo suelta siempre, salga bien o
 * mal. Con éxito, `onSent` corre antes de soltarlo, en el mismo paso: así no hay un render sin ocupado y con lo ya
 * enviado aún en pantalla. Nunca rechaza: devuelve si salió bien (el fallo ya sale en el aviso global de la sala).
 */
export async function sendWithBusy(setBusy: (busy: boolean) => void, send: () => Promise<unknown>, onSent?: () => void): Promise<boolean> {
  setBusy(true);
  try {
    await send();
    onSent?.();
    return true;
  } catch {
    return false;
  } finally {
    setBusy(false);
  }
}

/**
 * El aviso global para una orden: con `report`, limpia y publica el fallo (ya en español con `translate`), pero solo si
 * el socket sigue siendo el mismo (`isCurrent`); sin `report`, `null`, y el aviso global no se toca.
 */
export function roomErrorReporter(report: boolean, setError: (message: string | null) => void, translate: (message: string) => string, isCurrent: () => boolean): RoomErrorReporter | null {
  if (!report) return null;
  return { clear: () => setError(null), set: (message) => { if (isCurrent()) setError(translate(message)); } };
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
