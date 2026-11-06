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
 * a otra página en la misma pestaña lo conserva, y si el socket reconecta fuera de la sala se vuelve a enganchar (solo
 * «Salir», una expulsión, cerrar sesión o cerrar la pestaña lo liberan).
 */
export class SessionAttachment {
  private holders = 0;
  /** La pestaña ya se enganchó alguna vez: sigue pidiendo asiento al reconectar hasta `clear()`. */
  private attached = false;
  private socket: AttachSocket | null = null;

  /** El socket acaba de abrir: se engancha si alguien lo pide. Llamar antes de publicar `connected`. */
  opened(socket: AttachSocket): void {
    this.socket = socket;
    if (this.holders > 0 || this.attached) this.send();
  }

  closed(socket: AttachSocket): void {
    if (this.socket === socket) this.socket = null;
  }

  /** La pestaña deja de reenganchar al reconectar: «Salir», expulsión, cierre de sesión o cambio de cuenta. */
  clear(): void {
    this.attached = false;
  }

  /** Pide la sesión de sala; devuelve la función para dejar de pedirla (idempotente). */
  hold(): () => void {
    this.holders += 1;
    this.attached = true;
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
