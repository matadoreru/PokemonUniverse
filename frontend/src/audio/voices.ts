/**
 * Límite de sonidos simultáneos (spec §8), portado de Inazuma: cada efecto ocupa una voz mientras
 * dura y nunca hay más de `maxVoices`. La prioridad decide cuánto margen deja: 0 (foco, pestañas)
 * deja dos voces libres, 1 deja una y 2 (error, victoria) puede usar la última. Un mismo efecto no
 * se repite antes de su enfriamiento. Puro: el tiempo llega como parámetro (segundos).
 */

interface ActiveVoice {
  id: string;
  endsAt: number;
}

const MARGIN: Record<0 | 1 | 2, number> = { 0: 2, 1: 1, 2: 0 };

export class VoicePool {
  private active: ActiveVoice[] = [];
  private readonly last = new Map<string, number>();

  constructor(
    private readonly maxVoices: number,
    private readonly defaultCooldownMs: number,
  ) {}

  /** Número de voces ocupadas en el instante `now`. */
  count(now: number): number {
    this.active = this.active.filter((v) => v.endsAt > now);
    return this.active.length;
  }

  /** Reserva una voz para `id` si la política lo permite; devuelve si suena. */
  tryAcquire(id: string, now: number, durationSec: number, priority: 0 | 1 | 2, cooldownMs?: number): boolean {
    const cd = (cooldownMs ?? this.defaultCooldownMs) / 1000;
    const last = this.last.get(id);
    if (last !== undefined && now - last < cd) return false;
    if (this.count(now) >= this.maxVoices - MARGIN[priority]) return false;
    this.active.push({ id, endsAt: now + durationSec });
    this.last.set(id, now);
    return true;
  }

  reset(): void {
    this.active = [];
    this.last.clear();
  }
}
