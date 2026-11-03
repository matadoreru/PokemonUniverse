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
