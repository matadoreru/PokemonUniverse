/**
 * Lógica pura del kit de subasta (Arcade DS F8): cantidades válidas, incrementos, bloqueo de la puja con su texto,
 * historial y anuncios. Sin React, para probarla sola. Nunca devuelve `NaN` ni cantidades negativas.
 */

/** Entero no negativo a partir de cualquier valor (`NaN`, `Infinity`, negativos o decimales → entero ≥ 0). */
export function safeAmount(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

/** Lo escrito en el campo como entero, o `null` si no es un número entero positivo (vacío, letras, decimales, negativos). */
export function parseBid(draft: string): number | null {
  const text = draft.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Cantidad dentro de `[min, max]` (enteros ≥ 0). Vacío o no numérico da `min`; si `max < min` (no te llega para la
 * mínima) también da `min`: el bloqueo («Sin presupuesto») lo dice `bidBlock`.
 */
export function clampBid(raw: unknown, min: number, max: number): number {
  const low = Math.max(1, safeAmount(min));
  const high = safeAmount(max);
  const value = typeof raw === 'string' ? parseBid(raw) : Number.isFinite(raw as number) ? Math.floor(raw as number) : null;
  if (value === null || high < low) return low;
  return Math.min(high, Math.max(low, value));
}

/** Un incremento de la puja: una `Pill` con su atajo (1–4) que pone la cantidad en el campo (no puja sola). */
export interface BidStep {
  key: string;
  /** Texto corto de la píldora («Mínima», «+2», «+5», «Todo»). */
  label: string;
  value: number;
  /** Tecla del atajo («1»…). */
  shortcut: string;
}

/**
 * Incrementos válidos: la mínima, +2, +5 (sobre la mínima, como antes) y «Todo» (el máximo), sin repetir cantidades y
 * solo los que caben en `[min, max]`. Vacío si no llega para la mínima.
 */
export function bidSteps(min: number, max: number, { allIn = true }: { allIn?: boolean } = {}): BidStep[] {
  const low = Math.max(1, safeAmount(min));
  const high = safeAmount(max);
  if (high < low) return [];
  const candidates = [
    { key: 'min', label: 'Mínima', value: low },
    { key: 'plus2', label: '+2', value: low + 2 },
    { key: 'plus5', label: '+5', value: low + 5 },
    ...(allIn ? [{ key: 'all', label: 'Todo', value: high }] : []),
  ];
  const seen = new Set<number>();
  const steps: BidStep[] = [];
  for (const candidate of candidates) {
    if (candidate.value > high || seen.has(candidate.value)) continue;
    seen.add(candidate.value);
    steps.push({ ...candidate, shortcut: String(steps.length + 1) });
  }
  return steps;
}

/** Por qué no se puede pujar ahora (o `open`). */
export type BidBlockReason = 'open' | 'watching' | 'closed' | 'leading' | 'full' | 'noBudget' | 'waiting' | 'passed';

/** Lo que el jugador puede hacer con la puja y, en texto, por qué no. */
export interface BidBlock {
  reason: BidBlockReason;
  /** Puede subir la puja (el campo, los incrementos y «Pujar»). */
  canRaise: boolean;
  /** Puede pasar. */
  canPass: boolean;
  /** Título de la placa («Tu turno», «Ya vas ganando», «Sin presupuesto»…). */
  title: string;
  /** Ayuda en una frase. */
  text: string;
}

export interface BidBlockInput {
  /** ¿Juega? (`false`: observa). */
  participating: boolean;
  /** ¿Sigue abierta la puja? (fase de pujas con un lote en juego). */
  open: boolean;
  /** Lo que dice el servidor (`player.canRaise`/`canPass`): manda sobre lo demás para abrir. */
  canRaise: boolean;
  canPass: boolean;
  /** Va ganando la puja actual. */
  leading: boolean;
  /** Ya pasó en este lote o ronda. */
  passed?: boolean;
  /** No puede ganar más (Team Auction: equipo de 6). */
  full?: boolean;
  /** Mínima y máximo que puede pagar: con `max < min`, «Sin presupuesto». */
  min: number;
  max: number;
  /** Nombre de quien tiene el turno (`null`: nadie). */
  turnName: string | null;
  /** Unidad de la puja («monedas», «Pokémon»). */
  unit?: string;
  /** Textos propios por motivo (Bluff: «Sin presupuesto» no aplica; su máximo es el de la condición). */
  texts?: Partial<Record<BidBlockReason, { title: string; text: string }>>;
}

/**
 * Estado de la puja propia con su texto. Orden: observa → puja cerrada → va ganando → equipo completo → sin
 * presupuesto (sin subir, pero pasar si el servidor lo deja) → ya pasó (el motor pasa solo a quien no llega a la mínima:
 * así se dice por qué) → tu turno (lo que diga el servidor) → espera. La placa nunca muestra un botón activo que el
 * servidor rechazaría por esas razones.
 */
export function bidBlock(input: BidBlockInput): BidBlock {
  const unit = input.unit ?? 'monedas';
  const min = Math.max(1, safeAmount(input.min));
  const max = safeAmount(input.max);
  const blocked = (reason: BidBlockReason, title: string, text: string, canPass = false): BidBlock => ({ reason, canRaise: false, canPass, ...(input.texts?.[reason] ?? { title, text }) });
  const waitText = input.turnName ? `Turno de ${input.turnName}.` : 'Esperando el siguiente turno.';
  if (!input.participating) return blocked('watching', 'Estás observando', 'La puja actual, los presupuestos y los equipos son públicos.');
  if (!input.open) return blocked('closed', 'Puja cerrada', 'Este lote ya no admite pujas.');
  if (input.leading) return blocked('leading', 'Ya vas ganando', `Tu puja es la más alta. ${waitText}`);
  if (input.full) return blocked('full', 'Equipo completo', 'Ya tienes seis Pokémon: no pujas más en esta subasta.');
  // Sin llegar a la mínima no se sube, pero se puede pasar si el servidor lo deja (Bluff: la puja llegó al máximo y quien
  // tiene el turno debe poder pasar para cerrar la ronda; Team Auction pasa solo a quien no llega).
  if (max < min) return blocked('noBudget', 'Sin presupuesto', `La mínima es ${amountText(min, unit)} y tienes ${max}.`, input.canPass && !input.passed);
  if (input.passed) return blocked('passed', 'Has pasado', `Vuelves a pujar en el siguiente lote. ${waitText}`);
  if (input.canRaise || input.canPass) {
    return { reason: 'open', canRaise: input.canRaise, canPass: input.canPass, ...(input.texts?.open ?? { title: 'Tu turno', text: `Mínima ${min} · puedes llegar a ${max} ${unit}.` }) };
  }
  return blocked('waiting', 'Esperando tu turno', waitText);
}

/**
 * ¿Escuchan los atajos 1–4 de los incrementos? Solo si se puede subir, sin un envío en curso y sin el `Dialog` de
 * confirmar el pase abierto (con él abierto no deben cambiar el campo por detrás).
 */
export function bidShortcutsLive({ canRaise, busy, confirming }: { canRaise: boolean; busy: boolean; confirming: boolean }): boolean {
  return canRaise && !busy && !confirming;
}

/** Validación de lo escrito en el campo (texto bajo el campo; `null` si vale). */
export function bidDraftError(draft: string, min: number, max: number, unit = 'monedas'): string | null {
  const value = parseBid(draft);
  const low = Math.max(1, safeAmount(min));
  const high = safeAmount(max);
  if (value === null) return 'Escribe una cantidad entera.';
  if (value < low) return `La mínima es ${low}.`;
  if (value > high) return `No te llega: máximo ${high} ${unit}.`;
  return null;
}

/** Época del envío (para `useRefocusAfterReject`): cambia con el lote o ronda y con cada evento de la puja. */
export function bidEpoch(lot: number, events: number): number {
  return safeAmount(lot) * 10_000 + safeAmount(events);
}

/** «1 moneda», «3 monedas»; con otra unidad, tal cual («3 Pokémon»). */
export function amountText(amount: number, unit = 'monedas'): string {
  const value = safeAmount(amount);
  if (unit === 'monedas') return `${value} ${value === 1 ? 'moneda' : 'monedas'}`;
  return `${value} ${unit}`;
}

/** Evento de la puja tal como lo mandan los motores (Team Auction con `lotNumber`, Bluff sin él). */
export type BidEventLike = { playerId: string; type: 'BID'; amount: number } | { playerId: string; type: 'PASS' };

/** Franja del historial (`BidHistory`). */
export interface BidLogEntry {
  key: string;
  /** Quién (o qué, en los lotes cerrados). */
  name: string;
  /** Lo que hizo, en texto («Pujó 5», «Pasó», «Ganó por 6», «Sin dueño»). */
  text: string;
  tone: 'bid' | 'pass' | 'win' | 'none';
  /** Cantidad a la derecha (texto). */
  value?: string;
  /** Color del jugador (banda de la franja). */
  color?: string;
  /** Sprite (lotes cerrados). */
  sprite?: string;
  /** La última entrada (azul cielo con «Nueva»). */
  fresh?: boolean;
  self?: boolean;
}

/**
 * Franjas del historial de una puja, de la más reciente a la más antigua; la última, `fresh`. `nameOf` da el nombre y
 * `colorOf` el color de cada jugador.
 */
export function bidLog(events: readonly BidEventLike[], nameOf: (id: string) => string, { colorOf, selfId, unit = 'monedas' }: { colorOf?: (id: string) => string; selfId?: string; unit?: string } = {}): BidLogEntry[] {
  return events.map((event, index): BidLogEntry => ({
    key: `${index}-${event.playerId}-${event.type}`,
    name: nameOf(event.playerId),
    text: event.type === 'BID' ? `Pujó ${amountText(event.amount, unit)}` : 'Pasó',
    tone: event.type === 'BID' ? 'bid' : 'pass',
    ...(event.type === 'BID' ? { value: String(safeAmount(event.amount)) } : {}),
    ...(colorOf ? { color: colorOf(event.playerId) } : {}),
    ...(selfId && event.playerId === selfId ? { self: true } : {}),
    fresh: index === events.length - 1,
  })).reverse();
}

/** Estado de un jugador en la fila del orden de turno. */
export type TurnOrderState = 'turn' | 'leading' | 'passed' | 'waiting';

/** Un puesto de la fila del orden de turno (`AuctionLot`): el estado va también en texto (`stateText`). */
export interface TurnOrderEntry {
  id: string;
  name: string;
  state: TurnOrderState;
  /** «le toca», «va ganando», «pasó», «espera»: para lectores y como texto junto al icono. */
  stateText: string;
  self: boolean;
}

const TURN_ORDER_TEXT: Record<TurnOrderState, string> = { turn: 'le toca', leading: 'va ganando', passed: 'pasó', waiting: 'espera' };

/**
 * Fila del orden de turno de la puja en curso, en el orden del lote: quien tiene el turno, quien va ganando (aunque
 * figure como pasado) y quien ya pasó.
 */
export function turnOrderEntries({ order, turnId, passedIds, leaderId }: { order: readonly string[]; turnId: string | null; passedIds: readonly string[]; leaderId: string | null }, nameOf: (id: string) => string, selfId?: string): TurnOrderEntry[] {
  return order.map((id) => {
    const state: TurnOrderState = id === leaderId ? 'leading' : id === turnId ? 'turn' : passedIds.includes(id) ? 'passed' : 'waiting';
    return { id, name: nameOf(id), state, stateText: TURN_ORDER_TEXT[state], self: id === selfId };
  });
}

/**
 * Textos de la placa sin turno propio (para `BidBlockInput.texts`): a quién le toca y cómo va la puja, en vez de
 * controles grises. Sin nadie con el turno, vacío (quedan los del kit).
 */
export function waitTexts({ turnName, currentBid, leaderName, unit = 'monedas', passedText, noBidsText = 'Aún no hay pujas.' }: { turnName: string | null; currentBid: number | null; leaderName: string | null; unit?: string; passedText: string; noBidsText?: string }): NonNullable<BidBlockInput['texts']> {
  if (!turnName) return {};
  const title = `Le toca a ${turnName}`;
  return {
    leading: { title, text: `Tú vas ganando con ${amountText(currentBid ?? 0, unit)}.` },
    waiting: { title, text: currentBid !== null && leaderName ? `Puja actual: ${safeAmount(currentBid)} de ${leaderName}.` : noBidsText },
    passed: { title: 'Has pasado', text: `${title}. ${passedText}` },
  };
}
