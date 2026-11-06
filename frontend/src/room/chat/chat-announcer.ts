import type { ChatMessage } from '@pokemon-universe/shared/public';

/** Los mensajes que llegan dentro de esta ventana salen en un solo anuncio para el lector de pantalla. */
export const ANNOUNCE_GROUP_MS = 1500;

export function announcement(pending: ChatMessage[]): string {
  const last = pending[pending.length - 1];
  if (!last) return '';
  if (pending.length === 1) return `${last.authorName}: ${last.text}`;
  return `${pending.length} mensajes nuevos. El último, de ${last.authorName}: ${last.text}`;
}

type Schedule = (callback: () => void, ms: number) => number;

/**
 * Convierte los mensajes en vivo de otros en texto para la región `aria-live`. El historial y los propios solo se
 * marcan como vistos; la primera llamada también (un `Lobby` que se vuelve a montar no relee lo que ya había).
 */
export class ChatAnnouncer {
  private readonly seenSeqs = new Set<number>();
  private pending: ChatMessage[] = [];
  private timer: number | null = null;
  private primed = false;

  constructor(
    private readonly selfId: string,
    private readonly onText: (text: string) => void,
    private readonly schedule: Schedule = (callback, ms) => globalThis.setTimeout(callback, ms) as unknown as number,
  ) {}

  seen(messages: ChatMessage[], fromHistory: boolean): void {
    const silent = fromHistory || !this.primed;
    this.primed = true;
    for (const message of messages) {
      if (this.seenSeqs.has(message.seq)) continue;
      this.seenSeqs.add(message.seq);
      if (!silent && message.authorId !== this.selfId) this.pending.push(message);
    }
    if (this.pending.length > 0 && this.timer === null) {
      this.timer = this.schedule(() => this.flush(), ANNOUNCE_GROUP_MS);
    }
  }

  dispose(): void {
    if (this.timer !== null) globalThis.clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
  }

  private flush(): void {
    this.timer = null;
    const batch = this.pending;
    this.pending = [];
    if (batch.length > 0) this.onText(announcement(batch));
  }
}
