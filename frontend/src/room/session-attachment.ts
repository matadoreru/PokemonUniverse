/** Lo que usa del `RealtimeClient`: el estado de la conexión y el comando del enganche. */
interface AttachSocket {
  readonly connected: boolean;
  request(event: 'session:attach', payload: Record<string, never>): Promise<unknown>;
}

/**
 * Enganche de la conexión a la sesión de sala (`session:attach`). La cuenta registrada tiene el `/ws` abierto en toda
 * página, pero solo una conexión enganchada ocupa su asiento: lo pide `RoomSessionLayout` (`/play` y `/room`) mientras
 * está montado. Se envía en cada apertura del socket (también al reconectar) desde el aviso de conexión, antes de que
 * ninguna pantalla mande nada, y al montar si el socket ya estaba abierto. Al desmontar no se suelta el asiento: navegar
 * a otra página en la misma pestaña lo conserva (solo «Salir» o cerrar la conexión lo liberan).
 */
export class SessionAttachment {
  private holders = 0;
  private socket: AttachSocket | null = null;

  /** El socket acaba de abrir: se engancha si alguien lo pide. Llamar antes de publicar `connected`. */
  opened(socket: AttachSocket): void {
    this.socket = socket;
    if (this.holders > 0) this.send();
  }

  closed(socket: AttachSocket): void {
    if (this.socket === socket) this.socket = null;
  }

  /** Pide la sesión de sala; devuelve la función para dejar de pedirla (idempotente). */
  hold(): () => void {
    this.holders += 1;
    this.send();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders -= 1;
    };
  }

  /** Sin aviso global: si falla, la conexión sigue sin asiento y el siguiente comando de sala ya lo dirá. */
  private send(): void {
    const socket = this.socket;
    if (!socket?.connected) return;
    socket.request('session:attach', {}).catch(() => undefined);
  }
}
