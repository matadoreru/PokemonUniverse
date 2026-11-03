/** Sin conexión durante este tiempo al entrar en la sala, se avisa «Conectando»: una conexión normal (ms) no lo muestra. */
export const CONNECTING_NOTICE_DELAY_MS = 400;

/** `connecting`: aún no ha conectado nunca; `lost`: había conectado y se cayó; `null`: sin aviso. */
export type ConnectionNoticeKind = 'connecting' | 'lost' | null;

/**
 * Decide qué aviso de conexión mostrar a partir de los cambios de `connected`. «Conectando» espera
 * `CONNECTING_NOTICE_DELAY_MS` (evita el parpadeo y el salto de contenido en cada entrada); una conexión perdida se avisa
 * al momento. Solo llama a `onChange` cuando el aviso cambia.
 */
export function createConnectionNotice(onChange: (kind: ConnectionNoticeKind) => void, delayMs = CONNECTING_NOTICE_DELAY_MS) {
  let current: ConnectionNoticeKind = null;
  let wasConnected = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const show = (kind: ConnectionNoticeKind) => { if (kind !== current) { current = kind; onChange(kind); } };
  return {
    update(connected: boolean): void {
      if (connected) { cancel(); wasConnected = true; show(null); return; }
      if (wasConnected) { cancel(); show('lost'); return; }
      if (!timer && current === null) timer = setTimeout(() => { timer = null; show('connecting'); }, delayMs);
    },
    dispose(): void { cancel(); },
  };
}
